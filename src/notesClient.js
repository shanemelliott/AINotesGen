// TIU note-writing helpers: FileMan date conversion, visit string builder,
// appointment lookup, and TIU CREATE RECORD / TIU SIGN RECORD wrappers.
const fs = require('fs');
const path = require('path');
const { callRpc } = require('./vistaApiClient');

// XWB RPC broker substitution cipher for encrypted params (e.g. e-sig codes),
// ported from vista-notes/VistaJSLibrary.js (buildEncryptedSigString).
const CIPHER_PAD = [
  'wkEo-ZJt!dG)49K{nX1BS$vH<&:Myf*>Ae0jQW=;|#PsO`\'%+rmb[gpqN,l6/hFC@DcUa ]z~R}"V\\iIxu?872.(TYL5_3',
  'rKv`R;M/9BqAF%&tSs#Vh)dO1DZP> *fX\'u[.4lY=-mg_ci802N7LTG<]!CWo:3?{+,5Q}(@jaExn$~p\\IyHwzU"|k6Jeb',
  '\\pV(ZJk"WQmCn!Y,y@1d+~8s?[lNMxgHEt=uw|X:qSLjAI*}6zoF{T3#;ca)/h5%`P4$r]G\'9e2if_>UDKb7<v0&- RBO.',
  'depjt3g4W)qD0V~NJar\\B "?OYhcu[<Ms%Z`RIL_6:]AX-zG.#}$@vk7/5x&*m;(yb2Fn+l\'PwUof1K{9,|EQi>H=CT8S!',
  'NZW:1}K$byP;jk)7\'`x90B|cq@iSsEnu,(l-hf.&Y_?J#R]+voQXU8mrV[!p4tg~OMez CAaGFD6H53%L/dT2<*>"{\\wI=',
  'vCiJ<oZ9|phXVNn)m K`t/SI%]A5qOWe\\&?;jT~M!fz1l>[D_0xR32c*4.P"G{r7}E8wUgyudF+6-:B=$(sY,LkbHa#\'@Q',
  'hvMX,\'4Ty;[a8/{6l~F_V"}qLI\\!@x(D7bRmUH]W15J%N0BYPkrs&9:$)Zj>u|zwQ=ieC-oGA.#?tfdcO3gp`S+En K2*<',
  'jd!W5[];4\'<C$/&x|rZ(k{>?ghBzIFN}fAK"#`p_TqtD*1E37XGVs@0nmSe+Y6Qyo-aUu%i8c=H2vJ\\) R:MLb.9,wlO~P',
  '2ThtjEM+!=xXb)7,ZV{*ci3"8@_l-HS69L>]\\AUF/Q%:qD?1~m(yvO0e\'<#o$p4dnIzKP|`NrkaGg.ufCRB[; sJYwW}5&',
  'vB\\5/zl-9y:Pj|=(R\'7QJI *&CTX"p0]_3.idcuOefVU#omwNZ`$Fs?L+1Sk<,b)hM4A6[Y%aDrg@~KqEW8t>H};n!2xG{',
  'sFz0Bo@_HfnK>LR}qWXV+D6`Y28=4Cm~G/7-5A\\b9!a#rP.l&M$hc3ijQk;),TvUd<[:I"u1\'NZSOw]*gxtE{eJp|y (?%',
  'M@,D}|LJyGO8`$*ZqH .j>c~h<d=fimszv[#-53F!+a;NC\'6T91IV?(0x&/{B)w"]Q\\YUWprk4:ol%g2nE7teRKbAPuS_X',
  '.mjY#_0*H<B=Q+FML6]s;r2:e8R}[ic&KA 1w{)vV5d,$u"~xD/Pg?IyfthO@CzWp%!`N4Z\'3-(o|J9XUE7k\\TlqSb>anG',
  'xVa1\']_GU<X`|\\NgM?LS9{"jT%s$}y[nvtlefB2RKJW~(/cIDCPow4,>#zm+:5b@06O3Ap8=*7ZFY!H-uEQk; .q)i&rhd',
  'I]Jz7AG@QX."%3Lq>METUo{Pp_ |a6<0dYVSv8:b)~W9NK`(r\'4fs&wim\\kReC2hg=HOj$1B*/nxt,;c#y+![?lFuZ-5D}',
  'Rr(Ge6F Hx>q$m&C%M~Tn,:"o\'tX/*yP.{lZ!YkiVhuw_<KE5a[;}W0gjsz3]@7cI2\\QN?f#4p|vb1OUBD9)=-LJA+d`S8',
  'I~k>y|m};d)-7DZ"Fe/Y<B:xwojR,Vh]O0Sc[`$sg8GXE!1&Qrzp._W%TNK(=J 3i*2abuHA4C\'?Mv\\Pq{n#56LftUl@9+',
  '~A*>9 WidFN,1KsmwQ)GJM{I4:C%}#Ep(?HB/r;t.&U8o|l[\'Lg"2hRDyZ5`nbf]qjc0!zS-TkYO<_=76a\\X@$Pe3+xVvu',
  'yYgjf"5VdHc#uA,W1i+v\'6|@pr{n;DJ!8(btPGaQM.LT3oe?NB/&9>Z`-}02*%x<7lsqz4OS ~E$\\R]KI[:UwC_=h)kXmF',
  '5:iar.{YU7mBZR@-K|2 "+~`M%8sq4JhPo<_X\\Sg3WC;Tuxz,fvEQ1p9=w}FAI&j/keD0c?)LN6OHV]lGy\'$*>nd[(tb!#'
];

function randomPadIndex() {
  // VistA only recognizes the first 10 of the 20 CIPHER_PAD entries (matches
  // original vista-notes/VistaJSLibrary.js which uses _.random(0, 9)).
  return Math.floor(Math.random() * 10);
}

function buildEncryptedSigString(valueString) {
  const assocIndex = randomPadIndex();
  let idIndex = randomPadIndex();
  while (idIndex === assocIndex) idIndex = randomPadIndex();

  const assocStr = CIPHER_PAD[assocIndex];
  const idStr = CIPHER_PAD[idIndex];

  const encryptedValue = Array.prototype.reduce.call(valueString, (acc, ch) => {
    const pos = assocStr.indexOf(ch);
    return acc + (pos === -1 ? ch : idStr.charAt(pos));
  }, '');

  return String.fromCharCode(assocIndex + 32) + encryptedValue + String.fromCharCode(idIndex + 32);
}

const APPOINTMENTS_LOG_PATH = path.join(__dirname, 'appointments.json');

// Converts YYYY-MM-DD / HH:MM to FileMan datetime YYYMMDD.HHMM (years since 1700).
// VistA drops trailing zeros from the time portion (e.g. .1000 -> .1, .1130 -> .113).
function filemanDateTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const filemanYear = year - 1700;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return `${filemanYear}${mm}${dd}.${stripTrailingZeros(`${hh}${min}`)}`;
}

function stripTrailingZeros(digits) {
  const stripped = digits.replace(/0+$/, '');
  return stripped || '0';
}

function buildVisitString({ clinicIen, filemanDateTime: fmDateTime, type }) {
  return `${clinicIen};${fmDateTime};${type}`;
}

// Converts VPR dateTime (YYYYMMDDHHmm) directly to FileMan format (YYYMMDD.HHMM).
function filemanFromVprDateTime(vprDateTime) {
  const s = String(vprDateTime);
  const year = Number(s.slice(0, 4)) - 1700;
  return `${year}${s.slice(4, 8)}.${stripTrailingZeros(s.slice(8, 12))}`;
}

// Prefer the encounter's own linked appointment (authoritative, from a fresh
// VPR pull) over src/appointments.json, which may hold pre-rounding guesses.
function resolveAppointment(encounter, dfn, date) {
  const linked = encounter?.existing?.appointments?.[0];
  if (linked) {
    const match = linked.uid.match(/;(\d+)$/);
    return {
      clinicIen: match ? match[1] : null,
      fmDateTime: filemanFromVprDateTime(linked.dateTime),
      source: 'vpr'
    };
  }
  const logged = lookupAppointment(dfn, date);
  if (logged) {
    return {
      clinicIen: logged.clinicIen,
      fmDateTime: filemanDateTime(logged.date, logged.time || '10:00'),
      source: 'appointments.json'
    };
  }
  return null;
}

function lookupAppointment(dfn, date) {
  if (!fs.existsSync(APPOINTMENTS_LOG_PATH)) return null;
  const records = JSON.parse(fs.readFileSync(APPOINTMENTS_LOG_PATH, 'utf8'));
  return records.find((r) => r.dfn === dfn && r.date === date) || null;
}

function buildNoteParams({ dfn, noteTitleIen, locationIen, textLines, visitString, duz, fmDateTime }) {
  const namedArray = {
    1202: duz,
    1301: fmDateTime,
    1205: locationIen,
    1701: ''
  };
  textLines.forEach((line, i) => {
    namedArray[`\r"TEXT",${i + 1},0`] = line;
  });
  return [
    { string: dfn },
    { string: noteTitleIen },
    { string: '' }, // VDT
    { string: '' }, // VLOC
    { string: '' },
    { namedArray },
    { string: visitString },
    { string: '1' }, // SUPPRESS - suppress "missing encounter info" prompt (diagnosis/visit type/SC questions) so signing isn't blocked
    { string: '1' } // NOASF
  ];
}

function parseTiuIen(payload) {
  const match = String(payload).match(/(\d+)/);
  return match ? match[1] : null;
}

async function createNote({ dfn, noteTitleIen, locationIen, textLines, visitString, duz, fmDateTime }) {
  const params = buildNoteParams({ dfn, noteTitleIen, locationIen, textLines, visitString, duz, fmDateTime });
  const payload = await callRpc('TIU CREATE RECORD', params, 'OR CPRS GUI CHART');
  const tiuIen = parseTiuIen(payload);
  if (!tiuIen || tiuIen === '0') {
    const err = new Error(`TIU CREATE RECORD did not return a valid document IEN: ${payload}`);
    err.payload = payload;
    throw err;
  }
  return { tiuIen, payload };
}

async function signNote({ tiuIen, esigCode, retries = 2 }) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const encryptedSig = buildEncryptedSigString(esigCode);
    const payload = await callRpc('TIU SIGN RECORD', [{ string: tiuIen }, { string: encryptedSig }], 'OR CPRS GUI CHART');
    // TIU SIGN RECORD returns "0" (or empty) on success; any other text is an error message.
    const trimmed = String(payload).trim();
    const success = trimmed === '0' || trimmed === '';
    if (success || attempt === retries) return { success, payload };
  }
}

module.exports = {
  filemanDateTime,
  filemanFromVprDateTime,
  buildVisitString,
  lookupAppointment,
  resolveAppointment,
  buildNoteParams,
  parseTiuIen,
  buildEncryptedSigString,
  createNote,
  signNote
};
