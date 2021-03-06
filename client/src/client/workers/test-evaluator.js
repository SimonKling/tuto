import chai from 'chai';
import '@babel/polyfill';
import __toString from 'lodash/toString';

const __utils = (() => {
  const MAX_LOGS_SIZE = 64 * 1024;

  let logs = [];
  function flushLogs() {
    if (logs.length) {
      self.postMessage({
        type: 'LOG',
        data: logs.join('\n')
      });
      logs = [];
    }
  }

  function replacer(key, value) {
    if (Number.isNaN(value)) {
      return 'NaN';
    }
    return value;
  }

  const oldLog = self.console.log.bind(self.console);
  function proxyLog(...args) {
    logs.push(args.map(arg => '' + JSON.stringify(arg, replacer)).join(' '));
    if (logs.join('\n').length > MAX_LOGS_SIZE) {
      flushLogs();
    }
    return oldLog(...args);
  }

  // unless data.type is truthy, this sends data out to the testRunner
  function postResult(data) {
    flushLogs();
    self.postMessage(data);
  }

  function log(msg) {
    if (!(msg instanceof chai.AssertionError)) {
      // discards the stack trace via toString as it only useful to debug the
      // site, not a specific challenge.
      console.log(msg.toString());
    }
  }

  const toggleProxyLogger = on => {
    self.console.log = on ? proxyLog : oldLog;
  };

  return {
    postResult,
    log,
    toggleProxyLogger
  };
})();

/* Run the test if there is one.  If not just evaluate the user code */
self.onmessage = async e => {
  /* eslint-disable no-unused-vars */
  const { code = '' } = e.data;
  const assert = chai.assert;
  // Fake Deep Equal dependency
  const DeepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Build errors should be reported, but only once:
  __utils.toggleProxyLogger(e.data.firstTest);
  /* eslint-enable no-unused-vars */
  try {
    let testResult;
    let __userCodeWasExecuted = false;
    /* eslint-disable no-eval */
    try {
      // Logging is proxyed after the build to catch console.log messages
      // generated during testing.
      testResult = eval(`
        ${e.data.build}
        __userCodeWasExecuted = true;
        __utils.toggleProxyLogger(true);
        ${e.data.testString}
      `);
    } catch (err) {
      if (__userCodeWasExecuted) {
        // rethrow error, since test failed.
        throw err;
      }
      // log build errors
      __utils.log(err);
      // the tests may not require working code, so they are evaluated even if
      // the user code does not get executed.
      testResult = eval(e.data.testString);
    }
    /* eslint-enable no-eval */
    if (typeof testResult === 'function') {
      await testResult(fileName => __toString(e.data.sources[fileName]));
    }
    __utils.postResult({
      pass: true
    });
  } catch (err) {
    // Errors from testing go to the browser console only.
    __utils.toggleProxyLogger(false);
    // Report execution errors in case user code has errors that are only
    // uncovered during testing.
    __utils.log(err);
    // postResult flushes the logs and must be called after logging is finished.
    __utils.postResult({
      err: {
        message: err.message,
        stack: err.stack
      }
    });
  }
};

self.postMessage({ type: 'contentLoaded' });
