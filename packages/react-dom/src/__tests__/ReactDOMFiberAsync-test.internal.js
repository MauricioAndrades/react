/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

const React = require('react');
let ReactFeatureFlags = require('shared/ReactFeatureFlags');

let ReactDOM;

const AsyncMode = React.unstable_AsyncMode;

describe('ReactDOMFiberAsync', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    ReactDOM = require('react-dom');
  });

  it('renders synchronously by default', () => {
    const ops = [];
    ReactDOM.render(<div>Hi</div>, container, () => {
      ops.push(container.textContent);
    });
    ReactDOM.render(<div>Bye</div>, container, () => {
      ops.push(container.textContent);
    });
    expect(ops).toEqual(['Hi', 'Bye']);
  });

  describe('with feature flag disabled', () => {
    beforeEach(() => {
      jest.resetModules();
      ReactFeatureFlags = require('shared/ReactFeatureFlags');
      container = document.createElement('div');
      ReactDOM = require('react-dom');
    });

    it('renders synchronously', () => {
      ReactDOM.render(
        <AsyncMode>
          <div>Hi</div>
        </AsyncMode>,
        container,
      );
      expect(container.textContent).toEqual('Hi');

      ReactDOM.render(
        <AsyncMode>
          <div>Bye</div>
        </AsyncMode>,
        container,
      );
      expect(container.textContent).toEqual('Bye');
    });
  });

  describe('with feature flag enabled', () => {
    beforeEach(() => {
      jest.resetModules();
      ReactFeatureFlags = require('shared/ReactFeatureFlags');
      container = document.createElement('div');
      ReactFeatureFlags.debugRenderPhaseSideEffectsForStrictMode = false;
      ReactDOM = require('react-dom');
    });

    it('createRoot makes the entire tree async', () => {
      const root = ReactDOM.unstable_createRoot(container);
      root.render(<div>Hi</div>);
      expect(container.textContent).toEqual('');
      jest.runAllTimers();
      expect(container.textContent).toEqual('Hi');

      root.render(<div>Bye</div>);
      expect(container.textContent).toEqual('Hi');
      jest.runAllTimers();
      expect(container.textContent).toEqual('Bye');
    });

    it('updates inside an async tree are async by default', () => {
      let instance;
      class Component extends React.Component {
        state = {step: 0};
        render() {
          instance = this;
          return <div>{this.state.step}</div>;
        }
      }

      const root = ReactDOM.unstable_createRoot(container);
      root.render(<Component />);
      expect(container.textContent).toEqual('');
      jest.runAllTimers();
      expect(container.textContent).toEqual('0');

      instance.setState({step: 1});
      expect(container.textContent).toEqual('0');
      jest.runAllTimers();
      expect(container.textContent).toEqual('1');
    });

    it('AsyncMode creates an async subtree', () => {
      let instance;
      class Component extends React.Component {
        state = {step: 0};
        render() {
          instance = this;
          return <div>{this.state.step}</div>;
        }
      }

      ReactDOM.render(
        <AsyncMode>
          <Component />
        </AsyncMode>,
        container,
      );
      jest.runAllTimers();

      instance.setState({step: 1});
      expect(container.textContent).toEqual('0');
      jest.runAllTimers();
      expect(container.textContent).toEqual('1');
    });

    it('updates inside an async subtree are async by default', () => {
      let instance;
      class Child extends React.Component {
        state = {step: 0};
        render() {
          instance = this;
          return <div>{this.state.step}</div>;
        }
      }

      ReactDOM.render(
        <div>
          <AsyncMode>
            <Child />
          </AsyncMode>
        </div>,
        container,
      );
      jest.runAllTimers();

      instance.setState({step: 1});
      expect(container.textContent).toEqual('0');
      jest.runAllTimers();
      expect(container.textContent).toEqual('1');
    });

    it('flushSync batches sync updates and flushes them at the end of the batch', () => {
      let ops = [];
      let instance;

      class Component extends React.Component {
        state = {text: ''};
        push(val) {
          this.setState(state => ({text: state.text + val}));
        }
        componentDidUpdate() {
          ops.push(this.state.text);
        }
        render() {
          instance = this;
          return <span>{this.state.text}</span>;
        }
      }

      ReactDOM.render(<Component />, container);

      instance.push('A');
      expect(ops).toEqual(['A']);
      expect(container.textContent).toEqual('A');

      ReactDOM.flushSync(() => {
        instance.push('B');
        instance.push('C');
        // Not flushed yet
        expect(container.textContent).toEqual('A');
        expect(ops).toEqual(['A']);
      });
      expect(container.textContent).toEqual('ABC');
      expect(ops).toEqual(['A', 'ABC']);
      instance.push('D');
      expect(container.textContent).toEqual('ABCD');
      expect(ops).toEqual(['A', 'ABC', 'ABCD']);
    });

    it('flushSync flushes updates even if nested inside another flushSync', () => {
      let ops = [];
      let instance;

      class Component extends React.Component {
        state = {text: ''};
        push(val) {
          this.setState(state => ({text: state.text + val}));
        }
        componentDidUpdate() {
          ops.push(this.state.text);
        }
        render() {
          instance = this;
          return <span>{this.state.text}</span>;
        }
      }

      ReactDOM.render(<Component />, container);

      instance.push('A');
      expect(ops).toEqual(['A']);
      expect(container.textContent).toEqual('A');

      ReactDOM.flushSync(() => {
        instance.push('B');
        instance.push('C');
        // Not flushed yet
        expect(container.textContent).toEqual('A');
        expect(ops).toEqual(['A']);

        ReactDOM.flushSync(() => {
          instance.push('D');
        });
        // The nested flushSync caused everything to flush.
        expect(container.textContent).toEqual('ABCD');
        expect(ops).toEqual(['A', 'ABCD']);
      });
      expect(container.textContent).toEqual('ABCD');
      expect(ops).toEqual(['A', 'ABCD']);
    });

    it('flushSync throws if already performing work', () => {
      class Component extends React.Component {
        componentDidUpdate() {
          ReactDOM.flushSync(() => {});
        }
        render() {
          return null;
        }
      }

      // Initial mount
      ReactDOM.render(<Component />, container);
      // Update
      expect(() => ReactDOM.render(<Component />, container)).toThrow(
        'flushSync was called from inside a lifecycle method',
      );
    });

    it('flushSync flushes updates before end of the tick', () => {
      let ops = [];
      let instance;

      class Component extends React.Component {
        state = {text: ''};
        push(val) {
          this.setState(state => ({text: state.text + val}));
        }
        componentDidUpdate() {
          ops.push(this.state.text);
        }
        render() {
          instance = this;
          return <span>{this.state.text}</span>;
        }
      }

      ReactDOM.render(
        <AsyncMode>
          <Component />
        </AsyncMode>,
        container,
      );
      jest.runAllTimers();

      // Updates are async by default
      instance.push('A');
      expect(ops).toEqual([]);
      expect(container.textContent).toEqual('');

      ReactDOM.flushSync(() => {
        instance.push('B');
        instance.push('C');
        // Not flushed yet
        expect(container.textContent).toEqual('');
        expect(ops).toEqual([]);
      });
      // Only the active updates have flushed
      expect(container.textContent).toEqual('BC');
      expect(ops).toEqual(['BC']);

      instance.push('D');
      expect(container.textContent).toEqual('BC');
      expect(ops).toEqual(['BC']);

      // Flush the async updates
      jest.runAllTimers();
      expect(container.textContent).toEqual('ABCD');
      expect(ops).toEqual(['BC', 'ABCD']);
    });

    it('flushControlled flushes updates before yielding to browser', () => {
      let inst;
      class Counter extends React.Component {
        state = {counter: 0};
        increment = () =>
          this.setState(state => ({counter: state.counter + 1}));
        render() {
          inst = this;
          return this.state.counter;
        }
      }
      ReactDOM.render(
        <AsyncMode>
          <Counter />
        </AsyncMode>,
        container,
      );
      expect(container.textContent).toEqual('0');

      // Test that a normal update is async
      inst.increment();
      expect(container.textContent).toEqual('0');
      jest.runAllTimers();
      expect(container.textContent).toEqual('1');

      let ops = [];
      ReactDOM.unstable_flushControlled(() => {
        inst.increment();
        ReactDOM.unstable_flushControlled(() => {
          inst.increment();
          ops.push('end of inner flush: ' + container.textContent);
        });
        ops.push('end of outer flush: ' + container.textContent);
      });
      ops.push('after outer flush: ' + container.textContent);
      expect(ops).toEqual([
        'end of inner flush: 1',
        'end of outer flush: 1',
        'after outer flush: 3',
      ]);
    });

    it('flushControlled does not flush until end of outermost batchedUpdates', () => {
      let inst;
      class Counter extends React.Component {
        state = {counter: 0};
        increment = () =>
          this.setState(state => ({counter: state.counter + 1}));
        render() {
          inst = this;
          return this.state.counter;
        }
      }
      ReactDOM.render(<Counter />, container);

      let ops = [];
      ReactDOM.unstable_batchedUpdates(() => {
        inst.increment();
        ReactDOM.unstable_flushControlled(() => {
          inst.increment();
          ops.push('end of flushControlled fn: ' + container.textContent);
        });
        ops.push('end of batchedUpdates fn: ' + container.textContent);
      });
      ops.push('after batchedUpdates: ' + container.textContent);
      expect(ops).toEqual([
        'end of flushControlled fn: 0',
        'end of batchedUpdates fn: 0',
        'after batchedUpdates: 2',
      ]);
    });

    it('flushControlled returns nothing', () => {
      // In the future, we may want to return a thenable "work" object.
      let inst;
      class Counter extends React.Component {
        state = {counter: 0};
        increment = () =>
          this.setState(state => ({counter: state.counter + 1}));
        render() {
          inst = this;
          return this.state.counter;
        }
      }
      ReactDOM.render(<Counter />, container);
      expect(container.textContent).toEqual('0');

      const returnValue = ReactDOM.unstable_flushControlled(() => {
        inst.increment();
        return 'something';
      });
      expect(container.textContent).toEqual('1');
      expect(returnValue).toBe(undefined);
    });
  });
});
