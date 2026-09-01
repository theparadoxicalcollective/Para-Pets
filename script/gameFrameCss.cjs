const postcss = require('postcss');

// Fallbacks keep public/viewport-owned UI responsive; #game-stage supplies authored units.
function frameUnits(value) {
  if (/url\(/i.test(value)) return value;
  return value.replace(/(?<![\w.-])(-?(?:\d*\.)?\d+)(?:d|s|l)?v([wh])\b/g,
    (_, n, axis) => `calc(${n} * var(--v${axis}, 1v${axis}))`);
}

function referenceMedia(params) {
  return params.replace(/\(\s*(min-|max-)?(width|height)\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\s*\)/g,
    (_, bound, axis, amount, unit) => {
      const value = Number(amount) * (unit === 'px' ? 1 : 16);
      const reference = axis === 'width' ? 390 : 844;
      const matches = bound === 'min-' ? reference >= value : bound === 'max-' ? reference <= value : reference === value;
      return matches ? '(min-width: 0px)' : '(max-width: 0px)';
    });
}

function scopeSelector(selector, inside) {
  const suffix = inside ? ':where(#game-stage *)' : ':where(:not(#game-stage, #game-stage *))';
  // A pseudo-element must remain last in its compound selector.
  return selector.replace(/(::[\w-]+(?:\([^)]*\))?)?$/, (_, pseudo = '') => suffix + pseudo);
}

function gameFrameCss() {
  return {
    postcssPlugin: 'para-game-frame-css',
    OnceExit(root) {
      if (/tabletStageShell\.css$/.test(root.source?.input.file || '')) return;
      root.walkDecls(decl => {
        if (decl.prop === '--vw' || decl.prop === '--vh') return;
        decl.value = frameUnits(decl.value);
      });
      const handled = new WeakSet();
      const queries = [];
      root.walkAtRules('media', rule => queries.push(rule));
      for (const rule of queries) {
        if (handled.has(rule) || referenceMedia(rule.params) === rule.params) continue;
        const inside = rule.clone();
        inside.params = referenceMedia(inside.params);
        inside.walkAtRules('media', child => { child.params = referenceMedia(child.params); });
        for (const [tree, inFrame] of [[inside, true], [rule, false]]) {
          tree.walkRules(child => {
            if (child.parent?.type === 'atrule' && /keyframes$/.test(child.parent.name)) return;
            child.selectors = child.selectors.map(selector => scopeSelector(selector, inFrame));
          });
        }
        rule.walkAtRules('media', child => handled.add(child));
        rule.before(inside);
      }
    },
  };
}

function frameStylesheet(css) {
  const result = postcss([gameFrameCss()]).process(css, { from: undefined });
  result.sync();
  return result.css;
}

module.exports = gameFrameCss;
module.exports.frameUnits = frameUnits;
module.exports.referenceMedia = referenceMedia;
module.exports.frameStylesheet = frameStylesheet;
