// 새 서버(supabase/functions/joil/core.js)를 시험용 Postgres 위에 띄우는 도우미 (실제 Supabase 는 안 건드려요)
var path = require('path'), PG = require('./pg.js');
var CORE = path.join(__dirname, '..', '..', 'supabase', 'functions', 'joil', 'core.js');
/** { call(token, action, req), sql, srv, stop } · 없으면 null (Postgres 가 없는 컴퓨터) */
async function boot(opts) {
  var db = await PG.start(); if (!db) return null;
  var postgres = require(require('path').join(__dirname, 'node_modules', 'postgres')), sql = postgres(db.url, { max: 4, onnotice: function () {}, connection: { search_path: 'joil, extensions, public' } });
  opts = Object.assign({ calcSrc: require('fs').readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Calc.js'), 'utf8') }, opts || {});
  var core = await import(CORE), srv = core.makeServer(sql, opts);
  return { sql: sql, srv: srv, core: core, call: function (tok, action, req) { return srv.call(Object.assign({ action: action, token: tok }, req || {})); },
    stop: async function () { await sql.end(); await db.stop(); } };
}
/** 가짜 계정 넣기: [{ id, name, role, perms, tabs, pw }] */
async function users(t, list) {
  for (var u of list) { var salt = 'salt-' + u.id; await t.sql.unsafe("insert into accounts (id, name, role, status, pw_hash, salt, must_change, created_at, perms, disp_tabs) values ($1,$2,$3,'사용',$4,$5,$6,'2026-01-01 09:00:00',$7,$8)", [u.id, u.name, u.role, await t.srv._t.hash(u.pw || 'test1234', salt), salt, u.must ? 'Y' : 'N', u.perms == null ? null : u.perms, (u.tabs || []).join('\n')]); }
}
module.exports = { boot: boot, users: users };
