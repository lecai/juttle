'use strict';

var sink = require('./sink');

var INFO = {
    type: 'view',
    options: {}   // documented, non-deprecated options only
};

var view = sink.extend({
    initialize: function(options, params, location, program) {
        this.name = params.name;
        this.channel = 'view' + (program.channels++);
    },

    procName: function() {
        return 'view';
    },

    // When views get points/marks/ticks, they emit events on
    // the related program object. Program users will subscribe for
    // these events to receive the information from the views.
    //
    // Note: not using base.js::trigger as that's used for triggering
    // error/warning events and has special handling of arguments to
    // include proc names including the error/warning.

    mark: function(time) {
        this.program.events.emit('view:mark', {channel: this.channel, time: time});
    },
    tick: function(time) {
        this.program.events.emit('view:tick', {channel: this.channel, time: time});
    },
    eof: function() {
        this.program.events.emit('view:eof', {channel: this.channel});
        this.done();
    },
    process: function(points) {
        this.program.events.emit('view:points', {channel: this.channel, points: points});
    }

}, {
    info: INFO
});


module.exports = view;