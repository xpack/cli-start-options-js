[![npm (scoped)](https://img.shields.io/npm/v/@ilg/cli-start-options.svg)](https://www.npmjs.com/package/@ilg/cli-start-options) 
[![license](https://img.shields.io/github/license/xpack/cli-start-options-js.svg)](https://github.com/xpack/cli-start-options-js/blob/xpack/LICENSE) 
[![Standard](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com/)
[![Travis](https://img.shields.io/travis/xpack/cli-start-options-js.svg?label=linux)](https://travis-ci.org/xpack/cli-start-options-js)

## CLI startup and options processing

A Node.js module with classes to implement a command line Node.js application.

The module exports several classes (like CliApplication, CliCommand, ...) that can be used as base classes for CLI applications.

## Prerequisites

A recent [Node.js](https://nodejs.org) (>7.x), since the ECMAScript 6 class syntax is used.

If this is the first time you hear about Node.js, download and install the the binaries specific for your platform without any concerns, they're just fine. 

## Easy install

The module is available as [**@ilg/cli-start-options**](https://www.npmjs.com/package/@ilg/cli-start-options) from the public repository, use `npm` to install it inside the module where it is needed:

```bash
$ npm install @ilg/clis-start-options --save
```

The module does not provide any executables, and generaly there are few reasons to install it globally.

The development repository is available from the GitHub [xpack/cli-start-options-js](https://github.com/xpack/cli-start-options-js) project.

## User info

The module can be included in CLI applications and the classes can be used to derive application classes.

```javascript
// Equivalent of import { CliApplication, CliCommand, CliHelp, CliOptions } from 'cli-start-options'

const CliApplication = require('@ilg/cli-start-options').CliApplication
const CliCommand = require('@ilg/cli-start-options').CliCommand
const CliHelp = require('@ilg/cli-start-options').CliHelp
const CliOptions = require('@ilg/cli-start-options').CliOptions
```

## Developer info

### Git repo

```bash
$ git clone https://github.com/xpack/cli-start-options-js.git cli-start-options-js.git
$ cd cli-start-options-js.git
$ npm install
$ sudo npm link 
$ ls -l /usr/local/lib/node_modules/@ilg
```

In projects that use this module under development, link back from the global location:

```bash
$ npm link @ilg/cli-start-options
```

### Tests

As for any `npm` package, the standard way to run the project tests is via `npm test`:

```bash
$ cd cli-start-options-js.git
$ npm install
$ npm test
```

The tests use the [`node-tap`](http://www.node-tap.org) framework (_A Test-Anything-Protocol library for Node.js_, written by Isaac Schlueter).

The continuous integration tests are performed with [Travis CI](https://travis-ci.org/xpack/cli-start-options-js).

### Standard compliance

The module uses ECMAScript 6 class definitions.

As style, it uses the [JavaScript Standard Style](https://standardjs.com/), automatically checked at each commit via Travis CI.

Known and accepted exceptions:

- `// eslint-disable-line node/no-deprecated-api` to continue using the deprecated `domain` module

### Documentation metadata

The documentation metadata follows the [JSdoc](http://usejsdoc.org) tags.

To enforce checking at file level, add the following comments right after the `use strict`:

```
'use strict'
/* eslint valid-jsdoc: "error" */
/* eslint max-len: [ "error", 80, { "ignoreUrls": true } ] */
```

## License

The original content is released under the MIT License, with
all rights reserved to Liviu Ionescu.
