'use strict';
// 并发控制：全局并发上限 + 每主机并发上限；支持取消排队任务
class Limiter {
  constructor(max) { this.max = max; this.active = 0; this.queue = []; }
  run(fn, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(Object.assign(new Error('已取消'), { name: 'AbortError' }));
      const task = { fn, resolve, reject, signal };
      const onAbort = () => {
        const i = this.queue.indexOf(task);
        if (i >= 0) { this.queue.splice(i, 1); reject(Object.assign(new Error('已取消'), { name: 'AbortError' })); }
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const run = async () => {
        this.active++;
        try { resolve(await fn()); }
        catch (e) { reject(e); }
        finally {
          this.active--;
          if (signal) signal.removeEventListener('abort', onAbort);
          const n = this.queue.shift();
          if (n) {
            if (n.signal?.aborted) { n.reject(Object.assign(new Error('已取消'), { name: 'AbortError' })); run(); }
            else n.run();
          }
        }
      };
      task.run = run;
      if (this.active < this.max) run(); else this.queue.push(task);
    });
  }
  clear() {
    const q = this.queue.splice(0);
    for (const t of q) t.reject(Object.assign(new Error('已取消'), { name: 'AbortError' }));
  }
}
class HostPool {
  constructor(globalMax = 64, perHost = 4) {
    this.global = new Limiter(globalMax);
    this.perHost = perHost;
    this.hosts = new Map();
  }
  run(url, fn, signal) {
    let host = 'local';
    try { host = new URL(url).host; } catch {}
    if (!this.hosts.has(host)) this.hosts.set(host, new Limiter(this.perHost));
    return this.hosts.get(host).run(() => this.global.run(fn, signal), signal);
  }
  clear() {
    this.global.clear();
    for (const h of this.hosts.values()) h.clear();
  }
}
module.exports = { Limiter, HostPool };
