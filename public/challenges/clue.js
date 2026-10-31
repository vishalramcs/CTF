// Inspect surfaces (TRD §9): writes this challenge's clue cookies and localStorage keys, read from
// the page's #clue-writes block. Clue values are dummies, so scripts may read them on purpose.
(function () {
  var block = document.getElementById('clue-writes');
  if (!block) return;
  var writes = JSON.parse(block.textContent);
  (writes.cookies || []).forEach(function (cookie) {
    document.cookie =
      cookie.name +
      '=' +
      encodeURIComponent(cookie.value) +
      '; Path=' +
      window.location.pathname +
      '; SameSite=Lax';
  });
  (writes.localStorage || []).forEach(function (item) {
    try {
      window.localStorage.setItem(item.key, item.value);
    } catch {
      // Blocked storage only costs this clue, and the page must still work.
    }
  });
})();
