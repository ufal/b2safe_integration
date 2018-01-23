const config = require('config');

/*const winston = require("winston");

const level = process.env.LOG_LEVEL || 'debug';

const logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            level: level,
            colorize: true,
            timestamp: function () {
                return (new Date()).toISOString();
            }
        })
        ]
});

winston.addColors({
    error: 'red',
    warn:  'yellow',
    info:  'cyan',
    debug: 'green'
});*/

const logger = require('tracer')
    .colorConsole(
        {
          level : config.logger.level || 'trace',
          format : [
              "{{timestamp}} <{{title}}> {{file}}:{{line}} {{message}}",
              {
                trace : "{{timestamp}} <{{title}}> {{file}}:{{line}} {{method}} {{message}}"
              } ],
          dateformat : "HH:MM:ss.L"
        });

module.exports = logger;