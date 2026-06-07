chrome.devtools.panels.create(
  'API 调试',
  '../icons/icon48.png',
  'panel/panel.html',
  function(panel) {
    panel.onShown.addListener(function(win) {
      if (win && win.initPanel) {
        win.initPanel();
      }
    });
  }
);
