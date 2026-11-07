// Local-only error log: stays on this device and is never sent anywhere.
// Players can read, copy or clear it in Shanoware > Settings.
(function () {
  var KEY = 'shanoware.errors', MAX = 50;
  function log(msg, src) {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(list)) list = [];
      list.push({ t: Date.now(), page: location.pathname.split('/').slice(-2).join('/'), msg: String(msg).slice(0, 300), src: String(src || '').slice(0, 200) });
      localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    } catch (e) { /* storage full or blocked: nothing more we can do */ }
  }
  addEventListener('error', function (e) {
    if (e.message) log(e.message, (e.filename || '').split('/').pop() + ':' + e.lineno);
    else if (e.target && e.target !== window) log('A file failed to load', (e.target.src || e.target.href || '').split('/').pop());
  }, true);
  addEventListener('unhandledrejection', function (e) { log('Unhandled: ' + ((e.reason && e.reason.message) || e.reason)); });
})();
