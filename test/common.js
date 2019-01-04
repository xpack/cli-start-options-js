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

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const tar = require('tar')
const spawn = require('child_process').spawn
const Console = require('console').Console
const Writable = require('stream').Writable

// ES6: `import { CliHelp } from './utils/cli-helps.js'
const Xtest = require('./mock/xtest/main.js').Xtest

const Promisifier = require('@ilg/es6-promisifier').Promisifier

// ----------------------------------------------------------------------------

const mkdirpPromise = Promisifier.promisify(require('mkdirp'))

// ----------------------------------------------------------------------------

/**
 * Test common options, like --version, --help, etc.
 */

// ----------------------------------------------------------------------------

const nodeBin = process.env.npm_node_execpath || process.env.NODE ||
  process.execPath
const xtest = {}
xtest.programName = 'xtest'
xtest.mockPath = path.join('mock', 'xtest')
xtest.executableName = path.join('.', 'test', xtest.mockPath, 'bin',
  xtest.programName + '.js')

const ytest = {}
ytest.programName = 'ytest'
ytest.mockPath = path.join('mock', 'ytest')
ytest.executableName = path.join('.', 'test', ytest.mockPath, 'bin',
  ytest.programName + '.js')

const ztest = {}
ztest.programName = 'ztest'
ztest.mockPath = path.join('mock', 'ztest')
ztest.executableName = path.join('.', 'test', ztest.mockPath, 'bin',
  ztest.programName + '.js')

const wtest = {}
wtest.programName = 'wtest-long-name'
wtest.mockPath = path.join('mock', 'wtest')
wtest.executableName = path.join('.', 'test', wtest.mockPath, 'bin',
  wtest.programName + '.js')

// ============================================================================

/**
 * @class Main
 */
// export
class Common {
  /**
   * @summary Run program in a separate process.
   *
   * @async
   * @param {string} name Program name.
   * @param {string[]} argv Command line arguments.
   * @param {Object} spawnOpts Optional spawn options.
   * @returns {{code: number, stdout: string, stderr: string}} Exit
   *  code and captured output/error streams.
   *
   * @description
   * Spawn a separate process to run node with the given arguments and
   * return the exit code and the stdio streams captured in strings.
   */
  static async cli (name, argv, spawnOpts = {}) {
    return new Promise((resolve, reject) => {
      spawnOpts.env = spawnOpts.env || process.env

      // Runs in project root.
      // console.log(`Current directory: ${process.cwd()}`)
      let stdout = ''
      let stderr = ''
      const cmd = [name]
      const child = spawn(nodeBin, cmd.concat(argv), spawnOpts)

      assert(child.stderr)
      child.stderr.on('data', (chunk) => {
        // console.log(chunk.toString())
        stderr += chunk
      })

      assert(child.stdout)
      child.stdout.on('data', (chunk) => {
        // console.log(chunk.toString())
        stdout += chunk
      })

      child.on('error', (err) => {
        reject(err)
      })

      child.on('close', (code) => {
        resolve({ code, stdout, stderr })
      })
    })
  }

  static async xtestCli (argv, spawnOpts = {}) {
    const Self = this
    return Self.cli(xtest.executableName, argv, spawnOpts)
  }

  static async ytestCli (argv, spawnOpts = {}) {
    const Self = this
    return Self.cli(ytest.executableName, argv, spawnOpts)
  }

  static async ztestCli (argv, spawnOpts = {}) {
    const Self = this
    return Self.cli(ztest.executableName, argv, spawnOpts)
  }

  static async wtestCli (argv, spawnOpts = {}) {
    const Self = this
    return Self.cli(wtest.executableName, argv, spawnOpts)
  }

  /**
   * @summary Run xtest as a library call.
   *
   * @async
   * @param {string[]} argv Command line arguments
   * @param {Object} ctx Optional context.
   * @returns {{code: number, stdout: string, stderr: string}} Exit
   *  code and captured output/error streams.
   *
   * @description
   * Call the application directly, as a regular module, and return
   * the exit code and the stdio streams captured in strings.
   */
  static async xtestLib (argv, ctx = null) {
    assert(Xtest !== null, 'No application class')
    // Create two streams to local strings.
    let stdout = ''
    const ostream = new Writable({
      write (chunk, encoding, callback) {
        stdout += chunk.toString()
        callback()
      }
    })

    let stderr = ''
    const errstream = new Writable({
      write (chunk, encoding, callback) {
        stderr += chunk.toString()
        callback()
      }
    })

    const console_ = new Console(ostream, errstream)
    const context =
      await Xtest.initialiseContext({
        context: ctx,
        programName: xtest.programName,
        console: console_
      })
    const app = new Xtest(context)
    const code = await app.main(argv)
    return { code, stdout, stderr }
  }

  /**
   * @summary Extract files from a .tgz archive into a folder.
   *
   * @async
   * @param {string} tgzPath Path to archive file.
   * @param {string} destPath Path to destination folder.
   * @returns {undefined} Nothing.
   */
  static async extractTgz (tgzPath, destPath) {
    await mkdirpPromise(destPath)
    return new Promise((resolve, reject) => {
      fs.createReadStream(tgzPath)
        .on('error', (er) => { reject(er) })
        .pipe(zlib.createGunzip())
        .on('error', (er) => { reject(er) })
        .pipe(tar.extract({ cwd: destPath }))
        .on('error', (er) => { reject(er) })
        .on('end', () => { resolve() })
    })
  }
}

Common.xtest = xtest
Common.ytest = ytest

// ----------------------------------------------------------------------------
// Node.js specific export definitions.

// By default, `module.exports = {}`.
// The Main class is added as a property to this object.

module.exports.Common = Common

// In ES6, it would be:
// export class Common { ... }
// ...
// import { Common } from 'common.js'

// ----------------------------------------------------------------------------
