'use strict';
function UserError(message, code) { Error.call(this, message); this.name = 'UserError'; this.message = message; this.code = code; }
UserError.prototype = Object.create(Error.prototype);
UserError.prototype.constructor = UserError;
module.exports = UserError;
