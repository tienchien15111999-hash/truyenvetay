// Chuyển động 2D được tính theo thời gian để xem thử và xuất video cho cùng kết quả.
(() => {
  'use strict';

  const labels = Object.freeze({
    drink: 'Uống nước', smoke: 'Hút thuốc', eat: 'Ăn', phone: 'Nghe điện thoại',
    give: 'Đưa – nhận đồ', point: 'Chỉ tay', pick: 'Nhặt đồ', openDoor: 'Mở cửa',
    openBox: 'Mở hộp hoặc rương', launch: 'Tên lửa cất cánh', separate: 'Tên lửa tách tầng'
  });
  const roles = ['MAIN', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH'];
  const items = {
    key: /chìa khóa|\bkey\b/u, bottle: /\bchai\b|\bbottle\b/u, cup: /\b(?:cốc|ly|tách|cup|mug|glass)\b/u,
    letter: /lá thư|phong bì|tờ giấy|letter|envelope|paper/u, book: /quyển sách|cuốn sách|\bbooks?\b/u,
    phone: /điện thoại|\bphone\b/u, bag: /túi xách|túi giấy|cái túi|\bbag\b/u,
    spoon: /muỗng|thìa|spoon/u, food: /miếng bánh|bánh mì|bread|sandwich/u, box: /hộp|rương|hòm|chest|box/u
  };
  const triggers = {
    separate: /tách (?:tầng|ra khỏi)|hai tầng.*(?:tách|rời)|tầng (?:dưới|trên)[^.!?]{0,65}(?:tách ra|rời)|stag(?:e|ing) separat/u,
    launch: /cất cánh|rời bệ|phóng (?:lên|thành công)|vút lên|bật lên khỏi bệ|lift.?off|blast(?:s|ed)? off/u,
    smoke: /hút (?:điếu )?thuốc|rít (?:một hơi|thuốc)|hít (?:một hơi|thuốc)|đưa điếu thuốc lên (?:môi|miệng)|smok(?:es|ing) a cigarette/u,
    drink: /uống (?:nước|trà|cà phê|sữa|một ngụm|bia|rượu|từ)|nhấp (?:một )?ngụm|nhấp cà phê|đưa (?:cốc|ly|tách) lên môi|takes? a sip/u,
    eat: /(?:xúc|múc) (?:cơm|cháo|canh|súp)|đưa (?:thìa|muỗng|miếng bánh) lên miệng|ăn (?:cơm|cháo|bánh)|takes? a bite/u,
    phone: /nghe điện thoại|áp điện thoại lên tai|đưa điện thoại lên tai|answers? the phone/u,
    openDoor: /mở (?:cánh |chiếc )?cửa|đẩy cửa ra|opens? (?:the |a )?door/u,
    openBox: /mở (?:nắp |chiếc |cái )?(?:hộp|rương|hòm)|mở nắp|opens? (?:the |a )?(?:box|chest)/u,
    give: /(?:đưa|trao|chuyền|chuyển|dúi)\s+[^.!?]{1,72}?\s+(?:cho|vào tay|sang tay)\s+|hands? .{1,72} to /u,
    pick: /nhặt(?: lên| được| lấy)?\s+|cúi xuống nhặt|picks? up/u,
    point: /chỉ tay|giơ tay chỉ|trỏ tay|points? (?:at|toward)/u
  };

  const norm = value => String(value || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const own = (obj, key) => Object.hasOwn(obj, key);
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const step = (t, a, b) => { const u = clamp((t - a) / (b - a)); return u * u * (3 - 2 * u); };
  const mix = (a, b, t) => a + (b - a) * t;
  const move = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
  const pulse = (t, a, b, c, d) => step(t, a, b) * (1 - step(t, c, d));
  const angle = Math.PI / 180;
  const isRocket = /tên lửa|\bfalcon\s*[19]?\b|rocket|booster|tầng đẩy|hai tầng[^.!?]{0,50}(?:tách|rời)|tầng (?:dưới|trên)[^.!?]{0,45}(?:tách ra|rời khỏi)/u;
  const costumeColors = {
    blue: '#37738c', navy: '#343e63', red: '#ba554a', pink: '#c7798b', green: '#538569',
    mustard: '#c18a36', yellow: '#d69c45', purple: '#786893', white: '#d5d8cc', gray: '#778087', black: '#414653'
  };

  function castStyle(role, cast) {
    const index = Math.max(0, roles.indexOf(role));
    const entry = String(cast || '').split(/\n|;/).find(desc => new RegExp('^\\s*' + role + '\\b', 'i').test(desc)) || '';
    const style = norm(entry);
    const match = style.match(/\b(navy|blue|red|pink|green|mustard|yellow|purple|white|gray|black)\s+(?:shirt|jacket|blouse|coat|hoodie|dress|sweater|tunic|uniform)\b/u);
    const name = entry.match(/^\s*\w+\s*[=:–-]\s*([^():;]{1,45})/u)?.[1]?.trim() || '';
    return {
      role, name, shirt: match ? costumeColors[match[1]] : Object.values(costumeColors)[[0, 2, 4, 5, 3, 6, 8, 1][index]],
      skin: /dark skin|da ngăm|deep brown skin/u.test(style) ? '#ab6a4f' : /fair skin|pale skin|da trắng/u.test(style) ? '#f3bf9c' : '#e0a178',
      hair: /white hair|gray hair|grey hair|tóc bạc/u.test(style) ? '#a5a9a6' : /blond|tóc vàng/u.test(style) ? '#b67c41' : '#3a3440',
      long: /long hair|bob hair|ponytail|tóc dài|tóc ngang vai/u.test(style),
      glasses: /glasses|spectacles|đeo kính/u.test(style),
      beard: /\bbeard|có râu/u.test(style),
      hat: /\b(?:cap|hat)\b|đội mũ/u.test(style),
      variant: index % 3
    };
  }

  const negated = (text, i) => /(?:^|\s)(?:không|chưa|đừng|cấm|muốn|định)\s*$/u.test(text.slice(0, i));
  function inferAction(text, rocket) {
    for (const [action, pattern] of Object.entries(triggers)) {
      const result = pattern.exec(text);
      if (!result || (['launch', 'separate'].includes(action) && !rocket)) continue;
      if (negated(text, result.index)) continue;
      return { action, cue: result[0].trim().split(/\s+/u).slice(0, 5).join(' ') };
    }
    return null;
  }

  function plan(raw, narration, brief, cast, override = 'auto') {
    if (override === 'off') return null;
    const text = norm(narration), rocket = isRocket.test(text + ' ' + norm(brief));
    const fallback = inferAction(text, rocket);
    const rawCue = norm(raw?.cue), rawIndex = rawCue ? text.indexOf(rawCue) : -1;
    const cueMatches = rawIndex >= 0 && !negated(text, rawIndex) && !/(?:^|\s)(?:không|chưa|đừng|cấm|muốn|định)\s/u.test(rawCue);
    const accepted = raw && own(labels, raw.action) && (!['launch', 'separate'].includes(raw.action) || rocket) &&
      (cueMatches || fallback?.action === raw.action);
    const action = override === 'auto' ? (accepted ? raw.action : fallback?.action) : override;
    if (!own(labels, action)) return null;
    const useRaw = accepted && raw.action === action;
    const mentionedRoles = String(brief || '').match(/\b(?:MAIN|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH)\b/g) || [];
    const castPeople = roles.map(role => castStyle(role, cast));
    const named = castPeople.filter(p => p.name && text.includes(norm(p.name))).sort((a, b) => text.indexOf(norm(a.name)) - text.indexOf(norm(b.name)));
    const actor = useRaw && roles.includes(raw.actor) ? raw.actor : (named[0]?.role || mentionedRoles[0] || 'MAIN');
    const target = useRaw && roles.includes(raw.target) && raw.target !== actor ? raw.target :
      (named.find(p => p.role !== actor)?.role || mentionedRoles.find(r => r !== actor) || roles.find(r => r !== actor));
    const main = castPeople.find(p => p.role === actor);
    const other = action === 'give' ? castPeople.find(p => p.role === target) : null;
    const foundItem = Object.keys(items).find(name => items[name].test(text));
    const preset = { drink: 'cup', smoke: 'cigarette', phone: 'phone', eat: 'spoon', openBox: 'box' }[action];
    const allowed = {
      drink: ['cup', 'bottle'], eat: ['spoon', 'food'],
      give: Object.keys(items), pick: Object.keys(items)
    }[action] || [];
    const item = allowed.includes(raw?.item) && useRaw ? raw.item : (allowed.includes(foundItem) ? foundItem : preset || 'box');
    // Nếu câu kể không xác định được đạo cụ đưa/nhặt, giữ tranh minh họa để tránh vẽ sai đồ vật.
    if (override === 'auto' && ['give', 'pick'].includes(action) && !allowed.includes(foundItem) &&
        !(useRaw && allowed.includes(raw?.item))) return null;
    const seated = useRaw && ['sit','stand'].includes(raw.pose) ? raw.pose === 'sit' :
      /\bngồi\b|sitting/u.test(text) || (['drink', 'eat'].includes(action) && !/đứng|standing/u.test(text));
    const cue = useRaw && cueMatches ? rawCue : (fallback?.action === action ? fallback.cue : '');
    const before = cue ? text.slice(0, text.indexOf(cue)).split(' ').filter(Boolean).length : 0;
    const cueFraction = cue ? (before + 0.5) / Math.max(1, text.split(' ').length) : 0.38;
    const unlock = (action === 'openBox' || action === 'openDoor') && items.key.test(text);
    return { action, main, other, seated, item, unlock, cueFraction };
  }

  function progress(scene, seconds) {
    const voice = scene.buf?.duration;
    const duration = Math.max(0.4, voice || scene.dur || 5);
    const span = clamp(duration * 0.72, Math.min(0.75, duration), Math.min(6, duration));
    const start = clamp(duration * (scene.motionScene.cueFraction ?? 0.38) - 0.45 * span, 0, duration - span);
    return clamp((seconds - (voice ? 0.3 : 0) - start) / span);
  }

  function fillStroke(g, fill, edge = '#282b37', width = 2.8) {
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) {
      g.strokeStyle = edge; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    }
  }
  function shape(g, points, fill, edge, width) {
    g.beginPath();
    for (const [i, p] of points.entries()) i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
    if (fill) g.closePath();
    fillStroke(g, fill, edge, width);
  }
  function oval(g, x, y, rx, ry, fill, edge = null, width) {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); fillStroke(g, fill, edge, width);
  }
  function tube(g, a, b, c, color, width) {
    const line = (stroke, w) => {
      g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c);
      fillStroke(g, null, stroke, w);
    };
    line('#282b37', width + 4);
    line(color, width);
  }

  function arm(g, shoulder, hand, shirt, skin) {
    const dx = hand[0] - shoulder[0], dy = hand[1] - shoulder[1];
    const distance = Math.max(1, Math.hypot(dx, dy));
    const upper = Math.max(48, distance * 0.53), lower = Math.max(46, distance * 0.49);
    const axis = clamp((upper * upper - lower * lower + distance * distance) / (2 * distance), 0, distance);
    const bend = Math.sqrt(Math.max(0, upper * upper - axis * axis)) * (dx < -5 ? -1 : 1);
    const elbow = [shoulder[0] + (dx * axis - dy * bend) / distance,
      shoulder[1] + (dy * axis + dx * bend) / distance];
    const wrist = move(elbow, hand, 0.92);
    tube(g, shoulder, elbow, wrist, shirt, 18);
    oval(g, hand[0], hand[1], 9, 7.5, skin, '#282b37', 2.3);
    shape(g, [[hand[0]-4,hand[1]+1],[hand[0]+2,hand[1]+4]], null, '#7c584b', 1);
  }

  function person(g, a, colorMode, u) {
    g.save();
    g.translate(a.x, 0);
    g.scale(a.facing, 1);
    const style = a.style;
    const ink = '#282b37';
    const skin = colorMode === 'bw' ? '#f4ede3' : style.skin;
    const shirt = colorMode === 'bw' ? '#bbc0c2' : style.shirt;
    const hip = a.seated ? -58 : -91;
    const head = (a.seated ? -155 : -197) + a.bend * 45;
    const torsoTop = head + 44;
    const lean = a.bend * 25;
    const color = colorMode === 'bw' ? '#626973' : '#455267';
    const faceX = 8 + lean;
    const backHand = [-15, hip + 13];
    arm(g, [-14, torsoTop + 8], backHand, shirt, skin);
    const legs = a.seated ? [[[-8, hip], [36, -52], [38, -12]], [[7, hip + 3], [55, -48], [58, -12]]] :
      [[[-10, hip], [-17, -44], [-22, -11]], [[6, hip], [13, -43], [17, -11]]];
    for (const leg of legs) {
      tube(g, ...leg, color, 20);
      const [fx, fy] = leg[2];
      shape(g, [[fx-10,fy-3],[fx+9,fy-2],[fx+23,fy+3],[fx+25,fy+10],[fx-11,fy+10]], '#383440', ink, 2);
    }
    shape(g, [[lean-22,torsoTop+3],[lean+18,torsoTop],[lean+25,torsoTop+18],[16,hip+2],[-22,hip],[-28,hip-10]], shirt, ink, 2.6);
    shape(g, [[lean-17,torsoTop+12],[lean-13,torsoTop+33],[-13,hip-8]], null, '#ffffff45', 2.4);
    oval(g, faceX-3, head+36, 11, 14, skin, ink, 2.5);

    g.save(); g.translate(faceX,head); g.rotate(a.tilt * angle);
    if (style.long) oval(g,-9,6,28,47,style.hair,ink);
    g.beginPath(); g.moveTo(-24,-14);
    g.bezierCurveTo(-23,-49,28,-45,29,-11);
    g.quadraticCurveTo(29,-3,36,5); g.quadraticCurveTo(40,10,31,13);
    g.quadraticCurveTo(30,29,18,34); g.quadraticCurveTo(-12,38,-24,13);
    g.closePath(); fillStroke(g,skin,ink,2.7);
    oval(g,-22,4,7,9,skin,ink,1.8);
    g.beginPath(); g.moveTo(-26,-8); g.bezierCurveTo(-38,-42,0,-58,25,-32);
    g.quadraticCurveTo(33,-24,29,-16); g.quadraticCurveTo(13,-25,5,-28+style.variant*4);
    g.quadraticCurveTo(-7,-12,-18,-10); g.lineTo(-19,2); g.closePath();
    fillStroke(g,style.hair,ink,2.5);
    shape(g,[[-23,-28],[-9,-37],[6,-36],[20,-30]],null,'#fcf4e45a',1.6);
    if (style.hat) {
      shape(g,[[-27,-22],[-20,-41],[0,-49],[20,-40],[27,-23],[41,-20],[41,-15],[18,-16]],shirt,ink,2.5);
    }
    if (style.beard) {
      g.beginPath(); g.moveTo(2,23); g.quadraticCurveTo(23,25,29,18); g.lineTo(29,31);
      g.quadraticCurveTo(7,42,2,23); fillStroke(g,style.hair,ink,1.4);
    }
    oval(g,16,-6,3.2,4.8,ink);
    shape(g,[[9,-15],[17,-17],[23,-15]],null,ink,1.6);
    if (style.glasses) {
      oval(g,17,-5,11,8,null,ink,2.2); shape(g,[[-17,-7],[5,-8]],null,ink,1.8);
    }
    shape(g,[[17,20],[22,21],[28,19]],null,'#653c3c',2);
    if (u > 0.52 && u < 0.58 && !a.holdingMouth) oval(g,23,20,3.5,2.4,'#653c3c');
    g.restore();

    arm(g, [lean + 15, torsoTop + 10], [(a.hand[0] - a.x) * a.facing, a.hand[1]], shirt, skin);
    g.restore();
  }

  function prop(g, name, x, y, tilt, bw, glow = 0) {
    const ink = '#282b37';
    const accent = bw ? '#d7d8d4' : '#e6aa53';
    g.save(); g.translate(x,y); g.rotate(tilt * angle);
    switch (name) {
      case 'cup':
        oval(g,10,-1,9,8,null,ink,2.6);
        shape(g,[[-14,-15],[8,-15],[7,9],[2,14],[-8,12]],bw?'#f2f0e9':'#6d9eb0',ink);
        oval(g,-3,-15,11,4,'#f8e1b2',ink,2);
        break;
      case 'bottle':
        shape(g,[[-9,17],[-11,-6],[-7,-13],[-5,-21],[-4,-30],[4,-30],[5,-21],[7,-13],[11,-6],[9,17]],bw?'#e3e8e6':'#9bc6bb',ink,2.2);
        shape(g,[[-6,-31],[6,-31],[6,-25],[-6,-25]],accent,ink,1.2);
        break;
      case 'cigarette':
        shape(g,[[-4,-2],[23,-2],[23,2],[-4,2]],'#f5eddd',ink,1);
        shape(g,[[-4,-2],[3,-2],[3,2],[-4,2]],'#bda476',ink,1);
        oval(g,23,0,2.2+glow,2.2+glow,bw?'#555':(glow?'#ff643e':'#a76c52'));
        break;
      case 'key':
        oval(g,-2,0,7,6,null,accent,5);
        shape(g,[[5,0],[25,0],[25,7],[20,7],[20,4],[15,4]],accent,ink,1.5);
        break;
      case 'phone':
        shape(g,[[-7,-20],[7,-21],[9,17],[-5,18]],'#424d62',ink,2.5);
        shape(g,[[-4,-16],[4,-17],[6,9],[-3,10]],'#c2d8d8',null);
        oval(g,1,14,2,2,accent);
        break;
      case 'spoon':
        shape(g,[[-3,0],[22,-3]],null,'#7e8a93',4.5);
        oval(g,26,-4,8,5,'#d2d9d9',ink,1.3);
        oval(g,26,-5,4,2,accent);
        break;
      case 'food':
        oval(g,5,-3,13,9,'#d0a56c',ink,2);
        shape(g,[[0,-8],[4,-5],[10,-7]],null,'#f2d18e',2);
        break;
      case 'letter':
        shape(g,[[-13,-11],[15,-11],[15,10],[-13,10]],'#eee6d4',ink,2);
        shape(g,[[-12,-10],[1,2],[14,-10]],null,'#795d54',1.5);
        break;
      case 'book':
        shape(g,[[-13,-14],[13,-14],[13,14],[-13,14]],'#8c5d51',ink,2.3);
        shape(g,[[-7,-12],[-7,12],[12,12]],null,'#f0dbb5',2);
        break;
      case 'bag':
        oval(g,0,-13,8,9,null,ink,2.5);
        shape(g,[[-10,-11],[11,-11],[15,14],[-13,14]],accent,ink);
        break;
      default:
        shape(g,[[-13,-13],[13,-13],[15,12],[-14,12]],accent,ink,2.3);
        shape(g,[[0,-13],[0,12]],null,'#795d54',1.4);
    }
    g.restore();
  }

  function smoke(g, x, y, t, seed = 0, warm = false) {
    g.save();
    for (let i = 0; i < (warm ? 9 : 5); i++) {
      const a = t * (warm ? 2 : 1.6) - i * 0.13;
      if (a <= 0 || a >= 1) continue;
      const r = (warm ? 8 : 2) + a * (warm ? 18 : 9);
      const dx = Math.sin(i * 2.2 + seed + a * 4) * a * 24 + a * (warm ? 8 : 20);
      g.globalAlpha = (1-a) * (warm ? 0.43 : 0.55);
      oval(g,x+dx,y+(warm ? 8 : -42)*a,r,r*0.71,warm?'#e8c2a4':'#79838b');
    }
    g.restore();
  }

  function furniture(g, chairX, seated, tableX, food, bw) {
    const wood = bw ? '#a0a0a0' : '#9b6c54';
    const ink = '#282b37';
    if (seated) {
      shape(g,[[chairX-36,-119],[chairX-23,-119],[chairX-17,-55],[chairX+26,-56],[chairX+28,-44],[chairX-32,-43]],wood,ink,2.6);
      shape(g,[[chairX-29,-43],[chairX-31,0],[chairX-21,0],[chairX-18,-44],[chairX+17,-44],[chairX+20,0],[chairX+29,0],[chairX+27,-44]],wood,ink,2.5);
    }
    if (tableX == null) return;
    const top = food ? -50 : -52;
    shape(g,[[tableX-30,top],[tableX+38,top],[tableX+38,top+10],[tableX-30,top+10]],wood,ink,2.5);
    shape(g,[[tableX-25,top+8],[tableX-23,0],[tableX-14,0],[tableX-15,top+8],[tableX+22,top+8],[tableX+23,0],[tableX+32,0],[tableX+32,top+8]],wood,ink,2.4);
    if (food) {
      shape(g,[[tableX-9,top-7],[tableX+23,top-7],[tableX+17,top],[tableX-2,top]],'#d5dbd2',ink,1.8);
      oval(g,tableX+7,top-8,16,4,'#e1b685',ink,1.5);
    }
  }

  function door(g, open, bw) {
    const w = 76 * Math.cos(open * 1.2), skew = 11 * open;
    const wood = bw ? '#9c9d9a' : '#b58258';
    shape(g,[[-11,0],[-11,-214],[85,-214],[85,0],[75,0],[75,-203],[-1,-203],[-1,0]],wood,'#282b37',2.5);
    shape(g,[[-1,-202],[75,-202],[75,0],[-1,0]],'#464a52','#282b37',2);
    shape(g,[[0,-201],[w,-200+skew],[w,-1-skew],[0,-1]],wood,'#282b37',2.7);
    shape(g,[[7,-186],[w-7,-186+skew],[w-7,-120],[7,-120]],null,'#463b3b',1.5);
    shape(g,[[7,-90],[w-7,-90],[w-7,-17-skew],[7,-17]],null,'#463b3b',1.5);
    oval(g,w-11,-99,4.2,4.2,bw?'#e7e6dc':'#edb95f','#282b37',1.2);
  }

  function chest(g, rise, bw) {
    const wood = bw ? '#a0a0a0' : '#9f6d51';
    const hinge = [92,-74];
    shape(g,[[17,-65],[93,-74],[115,-45],[38,-35]],'#433840','#282b37');
    shape(g,[[38,-37],[115,-47],[115,-5],[38,2],[19,-13],[19,-68]],wood,'#282b37');
    shape(g,[[38,-36],[38,1],[115,-6]],null,'#563e38',2);
    shape(g,[[68,-41],[82,-42],[82,-27],[68,-26]],'#d6b17b','#282b37',1.5);
    g.save(); g.translate(...hinge); g.rotate(rise * 1.13);
    shape(g,[[0,-2],[-76,7],[-56,35],[21,25]],wood,'#282b37',2.6);
    shape(g,[[-66,12],[-52,28],[12,21]],null,'#f0c8a170',2);
    g.restore();
  }

  function rocket(g, x, y, delta, flame, bw) {
    const base = bw ? '#f4f1eb' : '#e7e9e4';
    const ink = '#282b37';
    g.save(); g.translate(x,y);
    if (flame > 0) {
      shape(g,[[-12,7],[11,7],[19,24],[0,41+flame*31],[-18,24]],'#dd6c46',ink,2);
      shape(g,[[-6,12],[6,12],[9,23],[0,41+flame*9],[-8,24]],'#efb758',null);
    }
    g.translate(-0.16*delta,0.38*delta);
    shape(g,[[-13,-15],[-13,-76],[14,-76],[14,-15],[12,8],[-12,8]],base,ink,2.6);
    shape(g,[[-13,-28],[-25,-4],[-25,9],[-13,4],[13,4],[24,9],[24,-4],[13,-28]],'#525966',ink,2);
    shape(g,[[-7,-69],[-7,-23]],null,'#9ba7aa',2);
    g.restore();

    g.save(); g.translate(x+0.13*delta,y-delta);
    shape(g,[[-13,-76],[-13,-120],[-9,-145],[0,-161],[10,-145],[14,-120],[14,-76]],base,ink,2.6);
    shape(g,[[-12,-111],[13,-111],[14,-100],[-13,-100]],'#444c5b',ink,1.2);
    shape(g,[[-7,-128],[-3,-148]],null,'#aab7b4',2);
    if (delta > 6) {
      shape(g,[[-6,-73],[7,-73],[9,-63],[0,-49],[-9,-63]],'#f3a154',ink,1.3);
    }
    g.restore();
  }

  function paint(g, scene, t, width, height) {
    const p = scene.motionScene;
    const u = progress(scene,t);
    const bw = p.colors === 'bw';
    const action = p.action;
    const flight = action === 'launch' || action === 'separate';
    const scale = Math.min(width / 380, height / (flight ? 370 : 294));
    const ground = height * 0.84;

    g.save();
    g.beginPath(); g.rect(0,0,width,height); g.clip();
    if (scene.motionBase) g.drawImage(scene.motionBase,0,0,width,height);
    else {
      const color = g.createLinearGradient(0,0,0,height);
      color.addColorStop(0,bw?'#eff0eb':'#f2e3c8'); color.addColorStop(1,bw?'#d9d9d4':'#d3ad90');
      g.fillStyle=color; g.fillRect(0,0,width,height);
    }
    g.translate(width/2,ground);
    g.scale(scale,scale);

    if (flight) {
      const rising = step(u,0.18,0.99);
      const y = action === 'launch' ? -14 - rising * 220 : 26 - step(u,0,1) * 48;
      const separation = action === 'separate' ? 100 * step(u,0.38,0.95) : 0;
      if (action === 'launch') {
        shape(g,[[-51,2],[-51,-5],[-26,-12],[25,-12],[49,-5],[49,2]], '#807775','#282b37',2.7);
        for (const x of [-23,12,33]) smoke(g,x,-10,u,x,true);
      }
      g.save();
      // Theo tên lửa vừa đủ để thân trên còn đọc được khi đã cất cánh.
      if (action === 'launch') g.translate(0,rising*92);
      rocket(g,0,y,separation,action === 'launch' ? step(u,0.12,0.27) : 0,bw);
      g.restore();
      g.restore(); return;
    }

    const give = action === 'give';
    const ax = give ? -105 : ['drink', 'eat', 'openDoor', 'openBox', 'pick'].includes(action) ? -65 : -22;
    const bx = 105;
    const seated = p.seated && ['drink','eat','give','phone','point','smoke'].includes(action);
    const torsoY = seated ? -155 : -197;
    const armRest = [ax+40, seated ? -74 : -95];
    const cupRest = [ax+77,-68];
    let hand = armRest, handB = [bx-42,-97], itemPos = null, itemAngle = 0, tilt = 0, bend = 0;
    let mouth = false, drawnItem = p.item;
    if (['drink','smoke','eat','phone'].includes(action)) {
      const up = pulse(u,0.12,0.43,action==='phone'?0.82:0.62,0.91);
      const rest = action==='drink' && seated ? cupRest : armRest;
      const target = action === 'phone' ? [ax-11,torsoY+7] : [ax+(action==='smoke'?48:action==='eat'?19:45),torsoY+19];
      if (action==='drink' && p.item==='bottle') target[0] = ax+48;
      hand = move(rest,target,up);
      tilt = action==='drink' ? -11*up : (action==='phone' ? -3*up : 0);
      itemPos = action === 'smoke' ? [hand[0]-9,hand[1]] : hand;
      itemAngle = action==='drink' ? -27*up : action==='eat' ? -6*up : -9*up;
      mouth = up > 0.85;
      if (action==='drink' && seated && u > 0.92) hand = move(cupRest,armRest,step(u,0.92,1));
      furniture(g,ax,seated,seated && ['drink','eat'].includes(action) ? cupRest[0] : null,action==='eat',bw);
    } else if (give) {
      const meeting = [0,seated ? -94 : -115];
      const reachA = pulse(u,0.12,0.48,0.52,0.93);
      const reachB = pulse(u,0.25,0.48,0.52,0.94);
      hand = move(armRest,meeting,reachA);
      handB = move(handB,meeting,reachB);
      itemPos = u < 0.5 ? hand : handB;
      furniture(g,ax,seated,null,false,bw);
    } else if (action === 'point') {
      hand = move(armRest,[ax+123,torsoY+38],pulse(u,0.08,0.43,0.7,0.99));
      furniture(g,ax,seated,null,false,bw);
    } else if (action === 'pick') {
      const p0 = [ax+71,-16], lift = step(u,0.5,0.91);
      bend = pulse(u,0.08,0.42,0.50,0.9);
      hand = u < 0.5 ? move(armRest,p0,step(u,0.08,0.45)) : move(p0,[ax+55,-97],lift);
      itemPos = u < 0.48 ? p0 : hand;
    } else if (action === 'openDoor' || action === 'openBox') {
      const isDoor = action === 'openDoor', release = p.unlock ? 0.49 : 0.40;
      const opening = step(u,release,0.83);
      const a = opening * 1.13;
      const latch = isDoor ? [76*Math.cos(opening*1.2)-11,-99] : [76,-34];
      const handle = isDoor ? latch : [92-57*Math.cos(a)-28*Math.sin(a),-74-57*Math.sin(a)+28*Math.cos(a)];
      if (isDoor) door(g,opening,bw);
      else chest(g,opening,bw);
      if (p.unlock) {
        const keyGrip = [latch[0]-17,latch[1]];
        hand = u < 0.39 ? move(armRest,keyGrip,step(u,0.07,0.24)) :
          move(move(keyGrip,handle,step(u,0.39,release)),armRest,step(u,0.83,0.99));
        itemPos = u < 0.39 ? hand : keyGrip;
        itemAngle = 42 * pulse(u,0.25,0.33,0.38,0.47);
        drawnItem = 'key';
      } else hand = move(armRest,handle,pulse(u,0.08,0.39,0.83,0.99));
    }

    oval(g,ax+13,0,seated?49:47,8,'#33334530');
    if (give) oval(g,bx,0,47,8,'#33334530');
    person(g,{ x:ax,facing:1,seated,hand,tilt,bend,holdingMouth:mouth,style:p.main },p.colors,u);
    if (give) person(g,{ x:bx,facing:-1,seated:false,hand:handB,tilt:0,bend:0,style:p.other },p.colors,u);
    if (itemPos) prop(g,drawnItem,...itemPos,itemAngle,bw,action==='smoke' && mouth ? 0.9 : 0);
    if (action==='smoke') {
      const tip = [itemPos[0]+22,itemPos[1]-3.5];
      smoke(g,...tip,u-0.18,2);
      smoke(g,ax+42,torsoY+21,u-0.60,1);
    }
    g.restore();
  }

  globalThis.StoryMotion = Object.freeze({ labels, plan, paint, progress });
})();
