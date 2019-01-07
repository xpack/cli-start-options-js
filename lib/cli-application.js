/*
 * This file is part of the xPack distribution
 *   (http://xpack.github.io).
 * Copyright (c) 2017 Liviu Ionescu.
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom
 * the Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict'
/* eslint valid-jsdoc: "error" */
/* eslint max-len: [ "error", 80, { "ignoreUrls": true } ] */

// ----------------------------------------------------------------------------

/*
 * This file provides the CLI startup code. It prepares a context
 * and calls the module `main()` code.
 */

// ----------------------------------------------------------------------------

const assert = require('assert')
const path = require('path')

const vm = require('vm')
const repl = require('repl')

const util = require('util')
const process = require('process')

const semver = require('semver')
const makeDir = require('make-dir')

const WscriptAvoider = require('wscript-avoider').WscriptAvoider
const Logger = require('@xpack/logger').Logger

const CliCommand = require('./cli-command.js').CliCommand
const CliOptions = require('./cli-options.js').CliOptions
const CliHelp = require('./cli-help.js').CliHelp
const CliExitCodes = require('./cli-error.js').CliExitCodes
const CliError = require('./cli-error.js').CliError
const CliErrorSyntax = require('./cli-error.js').CliErrorSyntax

const UpgradeChecker = require('./upgrade-checker.js').UpgradeChecker
const CliUtil = require('./cli-util.js').CliUtil

// ----------------------------------------------------------------------------
// Logger configuration
//
// `-s`, `--silent`: `--loglevel silent` (not even errors)
// `-q`, `--quiet`: `--loglevel warn` (errors and warnings)
// `--informative --loglevel info` (default)
// `-v`, `--verbose`: `--loglevel verbose`
// `-d`, '--debug': `--loglevel debug`
// `-dd`, '--trace': `--loglevel trace`

const defaultLogLevel = 'info'

// ----------------------------------------------------------------------------
// Exit codes (see CliError.js):
// - 0 = Ok
// - 1 = Syntax error, help()
// - 2 = Application error
// - 3 = Input error (no file, no folder, wrong format, etc)
// - 4 = Output error (cannot create file, cannot write, etc)
// - 5 = Child return error
// - 6 = Prerequisites (like node version)
// - 7 = Mismatched type, configuration error, unimplemented, unsupported.

// ============================================================================

/**
 * @typedef {Object} CliApplication class (Self)
 * @property {String} programName The name the program was invoked with,
 * extracted from argv[1].
 * @property {Logger} log
 */

/**
 * @typedef {Object} CliApplication instance (this)
 * @property {Logger} log
 * @property {Object} context
 * @property {Object[]} optionGroups
 * @property {Object} upgradeChecker
 * /

/**
  * @typedef {Object} Context
  * @property {Logger} log The logger.
  * @property {Object} config The configuration, parsed from the options.
  * @property {String} programName The short name the program was invoked with.
  * @property {String[]} full commands Optional array of commands, when
  *  CLiCommand is invoked.
  * @property {String} cmdPath Full command path, from argv[1]
  * @property {String} processCwd The process current working folder.
  * @property {String[]} processEnv The process environment.
  * @property {String[]} processArgv The process arguments.
  * @property {String} rootPath The absolute path of the project root folder.
  * @property {Object} package The parsed package.json.
  * @property {Number} startTime
  * @property {Object} console
  */

/**
 * @typedef {Object} Config
 * @property {String} cwd The actual current working folder, from -C.
 * @property {Number} logLevel The actual log level.
 * @property {Boolean} isInteractive
 * @property {Boolean} invokedFromCli
 * @property {Boolean} isVersionRequest
 */

/**
 * @classdesc
 * Base class for a CLI application.
 */
// export
class CliApplication {
  // --------------------------------------------------------------------------

  /**
   * @summary Application start().
   *
   * @param {Object} args The function arguments
   * @param {String} args.minNodeVersion The minimum node version acceptable.
   * @returns {Number} code Exit code.
   *
   * @static
   * @description
   * Start the CLI application, either in single shot
   * mode or interactive. (similar to _start() in POSIX)
   *
   * Called by the executable script in the bin folder.
   * Not much functionality here, just a wrapper to catch
   * global exceptions and call the CLI start implementation.
   *
   * For the exceptions to reach this top layer, all async functions
   * and all functions returning promises, must be called with `await`
   * otherwise the `UnhandledPromiseRejectionWarning` is currently
   * triggered.
   */
  static async start (args = {}) {
    // Explicit uppercase, to be obvious when a static property/method is used.
    const Self = this

    try {
      // The actual minimum is 7.7, but conservatively use 8.x.
      const minNodeVersion = args.minNodeVersion || '8.0.0'
      if (semver.lt(process.version, minNodeVersion)) {
        console.error(`Please use a newer node (at least ${minNodeVersion}).\n`)
        process.exit(CliError.ERROR.PREREQUISITES)
      }

      // To differentiate between multiple invocations with different
      // names, extract the name from the last path element; ignore
      // extensions, if any.
      Self.programName = path.basename(process.argv[1]).split('.')[0]

      // Avoid running on WScript. The journey may abruptly end here.
      WscriptAvoider.quitIfWscript(Self.programName)

      // Default logger with default mode (undefined).
      Self.log = new Logger({
        console
      })

      let exitCode = 0
      try {
        // Redirect to implementation code. After some common inits,
        // if not interactive, it'll call main().
        exitCode = await Self.doStart()
        // Pass through. Do not exit, to allow REPL to run.
      } catch (ex) {
        // This should catch possible errors during inits, otherwise
        // in main(), another catch will apply.
        exitCode = isNaN(ex.exitCode) ? CliExitCodes.ERROR.APPLICATION
          : ex.exitCode
        if (!Self.log.hasLevel()) {
          Self.log.level = 'info'
        }
        if (ex instanceof CliError) {
          // CLI triggered error. Treat it gently.
          Self.log.error(ex.message)
        } else /* istanbul ignore next */ {
          // System error, probably due to a bug (AssertionError).
          // Show the full stack trace.
          Self.log.error(ex.stack)
        }
        Self.log.verbose(`exit(${exitCode})`)
        process.exit(exitCode)
      }
    } catch (ex_) {
      console.error(ex_.stack)
      process.exit(CliExitCodes.ERROR.PREREQUISITES)
    }
    // Pass through. Do not exit, to allow REPL to run.
  }

  /**
   * @summary Implementation of a CLI starter.
   *
   * @returns {undefined} Nothing.
   *
   * @static
   * @description
   * As for any CLI application, the main input comes from the
   * command line options, available in Node.js as the
   * `process.argv` array of strings.
   *
   * One important aspect that must not be ignored, is how to
   * differentiate when called from scripts with different names.
   *
   * `process.argv0`
   * On POSIX, it is 'node' (uninteresting).
   * On Windows, it is the node full path (uninteresting as well).
   *
   * `process.argv[0]` is the node full path.
   * On macOS it looks like `${HOME}/Library/npm/bin` or `/usr/local/bin/node`.
   * On Ubuntu it looks like `${HOME}/opt/bin` or `/usr/bin/nodejs`
   * On Windows it looks like `C:\Program Files\nodejs\node.exe`.
   *
   * `process.argv[1]` is the full path of the invoking script.
   * On macOS it is either `${HOME}/Library/npm/bin/xyz`, or
   * `/usr/local/bin/xyz` or `.../bin/xyz.js`.
   * On Ubuntu it is either `${HOME}/opt/bin/xyz`, or
   * `/usr/bin/xyz` or `.../bin/xyz.js`.
   * On Windows, it is a path inside the `%AppData%` folder
   * like `C:\Users\ilg\AppData\Roaming\npm\node_modules\xyz\bin\xyz.js`
   *
   * To call a program with different names, create multiple
   * executable scripts in the `bin` folder and by processing
   * `argv[1]` it is possible to differentiate between them.
   *
   * The communication with the actual CLI implementation is done via
   * the context object, which includes a logger, a configuration
   * object and a few more properties.
   *
   * @override
   */
  static async doStart () {
    // Explicit uppercase, to be obvious when a static property/method is used.
    const Self = this

    // Set the application name, to make `ps` output more readable.
    process.title = Self.programName

    // Initialise the application, including commands and options.
    const context = await Self.initialiseContext({
      programName: Self.programName,
      console
    })

    // These are early messages, not shown immediately,
    // are delayed until the log level is known.
    Self.log.verbose(`${context.package.description}`)
    Self.log.debug(`argv0: ${process.argv[1]}`)

    const config = context.config

    // Parse the common options, for example the log level.
    // The result is in `config`.
    CliOptions.parseOptions(process.argv.slice(2), context)

    // This will flush the initial log.
    Self.log.level = config.logLevel

    const log = context.log
    log.level = config.logLevel

    process.argv.forEach((arg, index) => {
      log.debug(`start arg${index}: '${arg}'`)
    })

    log.trace(util.inspect(config))

    const serverPort = config.interactiveServerPort
    if (!serverPort) {
      if (!config.isInteractive) {
        // Non interactive means single shot (batch mode);
        // execute the command received on the command line
        // and quit. This is the most common usage.

        config.invokedFromCli = true

        // App instances exist only within a given context.
        let app = new Self(context)
        const code = await app.main(process.argv.slice(2))

        if (app.upgradeChecker) {
          await app.upgradeChecker.checkUpdate()
        }

        process.exit(code)
      } else {
        // Interactive mode. Use the REPL (Read-Eval-Print-Loop)
        // to get a shell like prompt to enter sequences of commands.

        const domain = require('domain').create() // eslint-disable-line node/no-deprecated-api, max-len
        domain.on('error', Self.replErrorCallback.bind(Self))
        repl.start(
          {
            prompt: Self.programName + '> ',
            eval: Self.replEvaluatorCallback.bind(Self),
            completer: Self.replCompleter.bind(Self),
            domain: domain
          }).on('exit', () => {
          console.log('Done.')
          process.exit(0)
        })
        // Pass through...
      }
    } else /* istanbul ignore next */ {
      // ----------------------------------------------------------------------
      // Useful during development, to test if everything goes to the
      // correct stream.

      const net = require('net')

      console.log(`Listening on localhost:${serverPort}...`)

      const domainSock = require('domain').create() // eslint-disable-line node/no-deprecated-api, max-len
      domainSock.on('error', Self.replErrorCallback.bind())

      net.createServer((socket) => {
        console.log(`Connection opened from ${socket.address().address}.`)

        repl.start({
          prompt: Self.programName + '> ',
          input: socket,
          output: socket,
          eval: Self.replEvaluatorCallback.bind(Self),
          completer: Self.replCompleter.bind(Self),
          domain: domainSock
        }).on('exit', () => {
          console.log('Connection closed.')
          socket.end()
        })
      }).listen(serverPort)
      // Pass through...
    }
    // Be sure no exit() is called here, since it'll close the
    // process and prevent interactive usage, which is inherently
    // asynchronous.
    log.verbose('doStart() returns')
  }

  /**
   * @summary Explicit initialiser for the class object. Kind of a
   *  static constructor.
   *
   * @returns {undefined}.
   *
   * @static
   * @description
   * Must override it in the derived implementation.
   */
  static initialise () {
    // Explicit uppercase, to be obvious when a static property/method is used.
    const Self = this

    Self.doInitialise()

    // ------------------------------------------------------------------------
    // Initialise the common options, that apply to all commands,
    // like options to set logger level, to display help, etc.
    CliOptions.addOptionGroups(
      [
        {
          title: 'Common options',
          optionDefs: [
            {
              options: ['-h', '--help'],
              action: (context) => {
                context.config.isHelpRequest = true
              },
              init: (context) => {
                context.config.isHelpRequest = false
              },
              isHelp: true
            },
            {
              options: ['--version'],
              msg: 'Show version',
              action: (context) => {
                context.config.isVersionRequest = true
              },
              init: (context) => {
                context.config.isVersionRequest = false
              },
              doProcessEarly: true
            },
            {
              options: ['--loglevel'],
              msg: 'Set log level',
              action: (context, val) => {
                context.config.logLevel = val
              },
              init: (context) => {
                context.config.logLevel = defaultLogLevel
              },
              values: ['silent', 'warn', 'info', 'verbose', 'debug', 'trace'],
              param: 'level'
            },
            {
              options: ['-s', '--silent'],
              msg: 'Disable all messages (--loglevel silent)',
              action: (context) => {
                context.config.logLevel = 'silent'
              },
              init: () => { }
            },
            {
              options: ['-q', '--quiet'],
              msg: 'Mostly quiet, warnings and errors (--loglevel warn)',
              action: (context) => {
                context.config.logLevel = 'warn'
              },
              init: () => { }
            },
            {
              options: ['--informative'],
              msg: 'Informative (--loglevel info)',
              action: (context) => {
                context.config.logLevel = 'info'
              },
              init: () => { }
            },
            {
              options: ['-v', '--verbose'],
              msg: 'Verbose (--loglevel verbose)',
              action: (context) => {
                context.config.logLevel = 'verbose'
              },
              init: () => { }
            },
            {
              options: ['-d', '--debug'],
              msg: 'Debug messages (--loglevel debug)',
              action: (context) => {
                const config = context.config
                if (config.logLevel === 'debug') {
                  config.logLevel = 'trace'
                } else {
                  config.logLevel = 'debug'
                }
              },
              init: () => { }
            },
            {
              options: ['-dd', '--trace'],
              msg: 'Trace messages (--loglevel trace, -d -d)',
              action: (context) => {
                context.config.logLevel = 'trace'
              },
              init: () => { }
            },
            {
              options: ['--no-update-notifier'],
              msg: 'Skip check for a more recent version',
              action: (context) => {
                context.config.noUpdateNotifier = true
              },
              init: () => { }
            },
            {
              options: ['-C'],
              msg: 'Set current folder',
              action: (context, val) => {
                const config = context.config
                if (path.isAbsolute(val)) {
                  config.cwd = val
                } else if (config.cwd) {
                  config.cwd = path.resolve(config.cwd, val)
                } else /* istanbul ignore next */ {
                  config.cwd = path.resolve(val)
                }
                context.log.debug(`set cwd: '${config.cwd}'`)
              },
              init: (context) => {
                context.config.cwd = context.processCwd
              },
              param: 'folder'
            }
          ]
        }
      ]
    )

    if (Self.hasInteractiveMode) {
      CliOptions.appendToOptionGroups('Common options',
        [
          {
            options: ['-i', '--interactive'],
            msg: 'Enter interactive mode',
            action: (context) => {
              context.config.isInteractive = true
            },
            init: (context) => {
              context.config.isInteractive = false
            },
            doProcessEarly: true
          },
          {
            options: ['--interactive-server-port'],
            action: (context, val) => /* istanbul ignore next */ {
              context.config.interactiveServerPort = val
            },
            init: (context) => {
              context.config.interactiveServerPort = undefined
            },
            hasValue: true,
            doProcessEarly: true
          }
        ]
      )
    }

    assert(Self.rootPath, 'mandatory rootPath not set')
  }

  /**
   * @summary Default implementation for the static class initialiser.
   *
   * @returns {undefined} Nothing.
   *
   * @static
   * @description
   * Override it in the derived implementation.
   *
   * @override
   */
  static doInitialise () /* istanbul ignore next */ {
    assert(false, 'Must override in derived implementation!')
  }

  /**
   * @summary Default initialiser for the configuration options.
   *
   * @param {Object} context Reference to the context object.
   * @returns {undefined} Nothing
   *
   * @static
   * @description
   * If further inits are needed, override `doInitialiseConfiguration()`
   * in the derived implementation.
   */
  static initialiseConfiguration (context) {
    // Explicit uppercase, to be obvious when a static property/method is used.
    const Self = this
    const config = context.config
    assert(config, 'There must be a configuration.')

    config.isInteractive = false
    config.interactiveServerPort = undefined

    config.logLevel = defaultLogLevel

    const optionGroups = CliOptions.getCommonOptionGroups()
    optionGroups.forEach((optionGroup) => {
      optionGroup.optionDefs.forEach((optionDef) => {
        optionDef.init(context)
      })
    })

    Self.doInitialiseConfiguration(context)
  }

  /**
   * @summary Custom initialiser for the configuration options.
   *
   * @param {Object} context Reference to the context object.
   * @returns {undefined} Nothing.
   *
   * @static
   * @description
   * Override it in the derived implementation.
   *
   * @override
   */
  static doInitialiseConfiguration (context) {
    const config = context.config
    assert(config, 'Configuration')
  }

  /**
   * @summary Initialise a minimal context object.
   *
   * @param {Object} args The arguments objects.
   * @param {Object} args.context Reference to a context, or null to create an
   *   empty context.
   * @param {string} args.programName The invocation name of the program.
   * @param {Object} args.console Reference to a node console.
   * @param {Object} args.log Reference to a npm log instance.
   * @param {Object} args.config Reference to a configuration.
   * @returns {Object} Reference to context.
   *
   * @static
   * @description
   * It is async because it needs to read the `package.json` file.
   */
  static async initialiseContext (args) {
    assert(args)
    assert(args.programName)

    // Explicit uppercase, to be obvious when a static property/method is used.
    const Self = this

    // Call the application initialisation callback, to prepare
    // the structure needed to manage the commands and option.
    if (!Self.isInitialised) {
      Self.initialise()

      Self.isInitialised = true
    }

    // Use the given context, or create an empty one.
    const context = args.context || vm.createContext()

    // REPL should always set the console, be careful not to
    // overwrite it.
    if (!context.console) {
      // Cannot use || because REPL context has only a getter.
      context.console = args.console || console
    }

    assert(context.console)
    context.programName = args.programName

    context.cmdPath = process.argv[1]
    context.processCwd = process.cwd()
    context.processEnv = process.env
    context.processArgv = process.argv

    // For convenience, copy root path from class to instance.
    context.rootPath = Self.rootPath

    if (!context.package) {
      context.package = await CliUtil.readPackageJson(this.rootPath)
    }

    // Initialise configuration.
    context.config = args.config || {}
    Self.initialiseConfiguration(context)
    if (!context.config.cwd) /* istanbul ignore next */ {
      context.config.cwd = context.processCwd
    }

    context.log = args.log || new Logger({
      console: context.console
    })

    assert(context.log)

    CliOptions.initialise(context.log)

    return context
  }

  // --------------------------------------------------------------------------

  /**
   * @summary Node.js callback.
   *
   * @callback nodeCallback
   * @param {number} responseCode
   * @param {string} responseMessage
   */

  /**
   * @summary A REPL completer.
   *
   * @param {string} linePartial The incomplete line.
   * @param {nodeCallback} callback Called on completion or error.
   * @returns {undefined} Nothing.
   *
   * @static
   * @description
   * TODO: Add code.
   */
  static replCompleter (linePartial, callback) /* istanbul ignore next */ {
    // callback(null, [['babu', 'riba'], linePartial])
    // console.log(linePartial)
    // If no completion available, return error (an empty string does it too).
    // callback(null, [[''], linePartial])
    callback(new Error('no completion'))
  }

  /**
   * @summary REPL callback.
   *
   * @callback replCallback
   * @param {number} responseCode or null
   * @param {string} [responseMessage] If present, the string will
   *  be displayed.
   */

  /**
   * @summary Callback used by REPL when a line is entered.
   *
   * @param {string} cmdLine The entire line, unparsed.
   * @param {Object} context Reference to a context.
   * @param {string} filename The name of the file.
   * @param {replCallback} callback Called on completion or error.
   * @returns {undefined} Nothing
   *
   * @static
   * @description
   * The function is passed to REPL with `.bind(Self)`, so it'll have
   * access to all class properties, like Self.programName.
   */
  static async replEvaluatorCallback (cmdLine, context, filename, callback) {
    // REPL always sets the console to point to its input/output.
    // Be sure it is so.
    assert(context.console !== undefined)

    // Explicit uppercase, to be obvious when a static property/method is used.
    const Self = this

    let app = null

    // It is mandatory to catch errors, this is an old style callback.
    try {
      // Fill in the given context, created by the REPL interpreter.
      // Start with an empty config.
      // With the current non-reentrant log, use the global object.
      await Self.initialiseContext({
        context,
        programName: Self.programName
      })

      // Definitely an interactive session.
      context.config.isInteractive = true

      // And definitely the module was invoked from CLI, not from
      // another module.
      context.config.invokedFromCli = true

      // Create an instance of the application class, for the given context.
      app = new Self(context)

      // Split command line and remove any number of spaces.
      const argv = cmdLine.trim().split(/\s+/)

      await app.main(argv)

      app = null // Pale attempt to help the GC.

      // Success, but do not return any value, since REPL thinks it
      // is a string that must be displayed.
      callback(null)
    } catch (ex) /* istanbul ignore next */ {
      app = null
      // Failure, will display `Error: ${ex.message}`.
      callback(ex)
    }
  }

  /**
   * @summary Error callback used by REPL.
   *
   * @param {Object} err Reference to error triggered inside REPL.
   * @returns {undefined} Nothing.
   *
   * @static
   * @description
   * This is tricky and took some time to find a workaround to avoid
   * displaying the stack trace on error.
   */
  static replErrorCallback (err) /* istanbul ignore next */ {
    // if (!(err instanceof SyntaxError)) {
    // System errors deserve their stack trace.
    if (!(err instanceof EvalError) && !(err instanceof SyntaxError) &&
      !(err instanceof RangeError) && !(err instanceof ReferenceError) &&
      !(err instanceof TypeError) && !(err instanceof URIError)) {
      // For regular errors it makes no sense to display the stack trace.
      err.stack = null
      console.log(err)
      // The error message will be displayed shortly, in the next handler,
      // registered by the REPL server.
    }
  }

  // --------------------------------------------------------------------------

  /**
   * Constructor, to remember the context.
   *
   * @param {Object} context Reference to a context.
   */
  constructor (context) {
    assert(context)
    assert(context.console)
    assert(context.log)
    assert(context.config)

    this.context = context
    this.log = context.log

    const log = this.context.log

    log.trace(`${this.constructor.name}.constructor()`)
  }

  /**
   * @summary Display the main help page.
   *
   * @returns {undefined} Nothing.
   *
   * @description
   * Override it in the application if custom content is desired.
   *
   * @override
   */
  help () {
    const log = this.log
    log.trace(`${this.constructor.name}.help()`)

    const help = new CliHelp(this.context)

    const optionGroups = this.optionsGroups ||
        CliOptions.getCommonOptionGroups()
    const cmds = CliOptions.getCommandsFirstArray()
    help.outputAll({
      obj: this,
      cmds,
      title: this.context.package.description,
      optionGroups
    })
  }

  /**
   * @summary Display the command durations.
   * @returns {undefined} Nothing.
   */
  outputDoneDuration () {
    const log = this.log
    log.info()

    const context = this.context
    const durationString =
      CliUtil.formatDuration(Date.now() - context.startTime)
    log.info(`'${context.programName}' completed in ${durationString}.`)
  }

  /**
   * @summary Output details about extra args.
   *
   * @returns {undefined} Nothing.
   *
   * @description
   * The default implementation does nothing. Override it in
   * the application if needed.
   *
   * @override
   */
  doOutputHelpArgsDetails () {
    // Nothing.
  }

  /**
   * @summary Default action when no commands are encountered.
   *
   * @param {Object} argv The arguments object.
   * @returns {Number} Exit code.
   *
   * @override
   */
  async doMain (argv) {
    this.log.trace(argv)

    this.help()
    return CliExitCodes.ERROR.SYNTAX // No commands.
  }

  /**
   * @summary The main entry point for the application.
   *
   * @param {String[]} argv Arguments array.
   * @returns {Number} The exit code.
   *
   * @description
   * Override it in the application if custom behaviour is desired.
   * If the application defines commands, they are called when identified,
   * otherwise the `doMain()` is called.
   *
   * @override
   */
  async main (argv) {
    const context = this.context
    context.startTime = Date.now()

    const log = this.log
    log.trace(`${this.constructor.name}.main()`)

    const config = context.config

    argv.forEach((arg, index) => {
      log.trace(`main arg${index}: '${arg}'`)
    })

    const remaining = CliOptions.parseOptions(argv, context)

    if (!log.hasLevel()) {
      log.level = config.logLevel
    }

    log.trace(util.inspect(context.config))

    // Early detection of `--version`, since it makes
    // all other irrelevant.
    if (config.isVersionRequest) {
      log.always(context.package.version)
      return CliExitCodes.SUCCESS
    }

    if (!config.noUpdateNotifier) {
      this.upgradeChecker = new UpgradeChecker(context)
      await this.upgradeChecker.getLatestVersion()
    }

    // Copy relevant args to local array.
    // Start with 0, possibly end with `--`.
    const mainArgs = CliOptions.filterOwnArguments(argv)

    // Isolate commands as words with letters and inner dashes.
    // First non word (probably option) ends the list.
    const cmds = []
    if (CliOptions.hasCommands()) {
      for (const arg of mainArgs) {
        const lowerCaseArg = arg.toLowerCase()
        if (lowerCaseArg.match(/^[a-z][a-z-]*/)) {
          cmds.push(lowerCaseArg)
        } else {
          break
        }
      }
    }

    // Save the commands in the context, for possible later use, since
    // they are skipped when calling the command implementation.
    context.commands = cmds

    // If no commands and -h, output the help message.
    if ((cmds.length === 0) && config.isHelpRequest) {
      this.help()
      return CliExitCodes.SUCCESS // Help explicitly called.
    }

    if (CliOptions.hasCommands()) {
      // If no commands, output help message and return error.
      if (cmds.length === 0) {
        log.error('Missing mandatory command.')
        this.help()
        return CliExitCodes.ERROR.SYNTAX // No commands.
      }
    }

    // Ensure the current folder exists (in case of `-C`)
    await makeDir(config.cwd)
    process.chdir(config.cwd)
    log.debug(`cwd()='${process.cwd()}'`)

    let exitCode = CliExitCodes.SUCCESS
    try {
      const found = CliOptions.findCommandClass(cmds, context.rootPath,
        CliCommand)
      if (CliCommand.isPrototypeOf(found.CmdClass)) {
        const CmdDerivedClass = found.CmdClass

        // Full name commands, not the actual encountered shortcuts.
        context.fullCommands = found.fullCommands

        log.debug(`Command(s): '${context.fullCommands.join(' ')}'`)

        // Use the original array, since we might have `--` options,
        // and skip already processed commands.
        const cmdArgs = remaining.slice(cmds.length - found.rest.length)
        cmdArgs.forEach((arg, index) => {
          log.trace(`cmd arg${index}: '${arg}'`)
        })

        // Instantiate the command, in preparation for execution.
        const cmdImpl = new CmdDerivedClass(context)

        log.debug(`'${context.programName} ` +
            `${context.fullCommands.join(' ')}' started`)

        exitCode = await cmdImpl.run(cmdArgs)
        log.debug(`'${context.programName} ` +
            `${context.fullCommands.join(' ')}' - returned ${exitCode}`)
      } else {
        log.debug(`'${context.programName} started`)

        // No commands, try the simple main implementation. If not
        // defined by the user, the default one should display `help()`.
        exitCode = await this.doMain(remaining)

        log.debug(`'${context.programName} started - returned ${exitCode}`)
      }

      return exitCode
    } catch (ex) {
      exitCode = isNaN(ex.exitCode) ? CliExitCodes.ERROR.APPLICATION
        : ex.exitCode
      if (ex instanceof CliErrorSyntax) {
        // CLI triggered error. Treat it gently and try to be helpful.
        log.error(ex.message)
        this.help()
        exitCode = isNaN(ex.exitCode) ? CliExitCodes.ERROR.SYNTAX
          : ex.exitCode
      } else if (ex instanceof CliError) {
        // Other CLI triggered error. Treat it gently.
        log.error(ex.message)
      } else {
        // System error, probably due to a bug (AssertionError).
        // Show the full stack trace.
        log.error(ex.stack)
      }
      log.verbose(`exit(${exitCode})`)
      return exitCode
    }
  }
}

// ----------------------------------------------------------------------------
// Node.js specific export definitions.

// By default, `module.exports = {}`.
// The CliApplication class is added as a property of this object.
module.exports.CliApplication = CliApplication

// In ES6, it would be:
// export class CliApplication { ... }
// ...
// import { CliApplication } from 'cli-application.js'

// ----------------------------------------------------------------------------
