/* Aparência: claro, escuro ou automático (segue o aparelho) e o estilo visual (Maré é o padrão).
   Fica por aparelho (não vai ao Drive). Carregado no <head>, antes do CSS pintar, para a tela não piscar na cor errada. */
(function () {
  var STYLES = ['mare', 'mata', 'ameixa'], MODES = ['auto', 'light', 'dark'];
  var BAR = { mata: ['#0b5d4a', '#0f2f27'], ameixa: ['#4b2170', '#2a163f'], mare: ['#0c4a5f', '#0d2f3b'] };
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function read(k, list) { try { var v = localStorage.getItem(k); return list.indexOf(v) >= 0 ? v : list[0]; } catch (e) { return list[0]; } }
  function get() { return { mode: read('fin.theme', MODES), style: read('fin.style', STYLES) }; }
  function apply() {
    var c = get(), dark = c.mode === 'dark' || (c.mode === 'auto' && !!mq && mq.matches), el = document.documentElement;
    el.setAttribute('data-mode', dark ? 'dark' : 'light');
    el.setAttribute('data-style', c.style);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', BAR[c.style][dark ? 1 : 0]);
    return { mode: c.mode, style: c.style, dark: dark };
  }
  function set(k, v) { try { localStorage.setItem(k === 'mode' ? 'fin.theme' : 'fin.style', v); } catch (e) { /* armazenamento bloqueado: vale só nesta abertura */ } return apply(); }
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply); }
  window.FIN_THEME = { get: get, apply: apply, set: set, STYLES: STYLES, MODES: MODES };
  apply();
})();
