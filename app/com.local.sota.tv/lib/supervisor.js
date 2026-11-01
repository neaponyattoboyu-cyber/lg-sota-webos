'use strict';
function Supervisor(deps) { this.d = deps; this.failures = 0; this.lastHealth = 0; this.lastRetry = 0; this.lastCheck = deps.lastCheck ? deps.lastCheck() : 0; this.first = true; this.lastTick = 0; }
Supervisor.prototype.tick = async function () {
  var d = this.d, now = d.now(), settings = d.settings(), wake = this.lastTick && now - this.lastTick > 45000;
  this.lastTick = now;
  if (await d.updating() || d.busy()) return;
  if (this.first) {
    this.first = false;
    if (settings.autoUpdate && d.ready()) { d.enqueue('install'); return; }
  }
  if (settings.autostart && !d.paused()) {
    var state = await d.status();
    if (!state.running && now - this.lastRetry > 25000 && await d.networkReady()) {
      this.lastRetry = now;
      // A verified saved profile starts quickly while provider API may be blocked.
      d.enqueue(d.hasConfig() ? 'resume' : 'connect');
      return;
    } else if (state.running && (wake || now - this.lastHealth > 60000)) {
      this.lastHealth = now;
      var healthy = await d.healthy();
      this.failures = healthy ? 0 : this.failures + 1;
      if ((this.failures >= 3 || (wake && !healthy)) && await d.networkReady()) { this.failures = 0; d.enqueue('connect'); return; }
    }
  }
  if (settings.checkUpdates && now - this.lastCheck > 86400000 && await d.networkReady()) {
    if (d.enqueue('check-update')) this.lastCheck = now;
  }
};
module.exports = Supervisor;
