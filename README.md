# smart-restart

[![CircleCI](https://circleci.com/gh/jedwards1211/smart-restart?style=svg)](https://circleci.com/gh/jedwards1211/smart-restart)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![npm version](https://badge.fury.io/js/smart-restart.svg)](https://badge.fury.io/js/smart-restart)

`nodemon` and `piping` are great, but each has their limitations:

`nodemon` sometimes restarts when you change files the server isn't using, which is a hassle when you're working on
isomorphic apps and just want a webpack hot update on the client.

`piping` is difficult to use with `node-inspector` because it runs a cluster; the supervisor process gets debug port 5858,
and your app process gets something else. It's even more of a pain to use with `--debug-brk` because the supervisor
process starts with a breakpoint as well, so you have to open `node-inspector` for it, resume it, _then_ open
`node-inspector` for your actual app.

`smart-restart` combines both approaches: it uses `piping`'s require hook to only watch files that have been required,
but it `spawns` your app instead of running a cluster, so that you can pass `--debug` or `--debug-brk` to your app.

## Usage

To run `./src/index.js` in a child process and watch files it `require`s:

```js
var launch = require('smart-restart')

launch({
  main: './src/index.js',         // path to your script
  command: 'node',                // optional, the command to `spawn` (default: `process.argv[0]`)
  commandOptions: ['--inspect'],  // optional, arguments that come before `main`
  args: [...],                    // optional, arguments that come after `main`
  spawnOptions: {...},            // optional, options for `spawn`
  ignore: /(\/\.|~$)/,            // optional, ignore pattern for `chokidar` (default: /(\/\.|~$)/)
  usePolling: false,              // optional, whether to use polling in `chokidar` (default: false)
  interval: 100,                  // optional, polling interval for `chokidar` (default: 100)
  binaryInterval: 300,            // optional, binary polling interval for `chokidar` (default: 300)
  includeModules: false,          // optional, whether to include `node_modules` (default: false)
  killSignal: 'SIGTERM',          // optional, signal to kill process with when restarting
  killTimeout: 5000,              // optional, max amount of milliseconds to wait for process to get killed (default: 10000)
  deleteRequireCache: [           // optional, when any files in this array (or files they require)
                                  //    are changed, all of these files will be deleted from `require.cache`
                                  //    instead of restarting the process.
    'src/server/ssr/serverSideRender.js',
  ],
})
```

You can `launch` as many other processes as you want in the same supervisor process.
