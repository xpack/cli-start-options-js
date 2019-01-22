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

/**
 * The Wtest main module.
 *
 * It is re-exported publicly by `index.js`.
 *
 * To import classes from this module into Node.js applications, use:
 *
 * ```javascript
 * const Wtest = require('ztest').Wtest
 * ```
 */

// ----------------------------------------------------------------------------

// const path = require('path')

// ES6: `import { CliApplication, CliOptions } from 'cli-start-options'
const CliApplication = require('../../../index.js').CliApplication

// ============================================================================

// export
class Wtest extends CliApplication {
  // --------------------------------------------------------------------------

  /**
   * @summary Construct the application object.
   *
   * @param {Object} params The generic parameters object.
   *
   * @description
   * Initialise the options manager with application
   * specific commands and common options.
   */
  constructor (params) {
    super(params)

    const log = this.log

    // Mandatory, must be set here, not in the library, since it takes
    // the shortcut of using `__dirname` of the main file.
    this.rootAbsolutePath = __dirname

    // ------------------------------------------------------------------------
    // Initialise the tree of known commands.
    // Paths should be relative to the package root.

    const commands = {
      'one-long-command': {
        modulePath: 'none.js'
      },
      'two-long-command': {
        modulePath: 'none.js'
      },
      'three-long-command': {
        modulePath: 'none.js'
      },
      'four-long-command': {
        modulePath: 'none.js'
      },
      'five-long-command': {
        modulePath: 'none.js'
      },
      'six-long-command': {
        modulePath: 'none.js'
      }
    }
    this.cmdsTree.addCommands(commands)
    log.trace(this.cmdsTree.getCommandsNames())
  }

  // --------------------------------------------------------------------------

  // main(): use parent definition
  // help(): use parent definition.

  // (isn't object oriented code reuse great?)
}

// ----------------------------------------------------------------------------
// Node.js specific export definitions.

// By default, `module.exports = {}`.
// The Xtest class is added as a property to this object.

module.exports.Wtest = Wtest

// In ES6, it would be:
// export class Wtest { ... }
// ...
// import { Wtest } from 'wtest.js'

// ----------------------------------------------------------------------------
