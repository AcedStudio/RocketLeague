import "server-only";
import { q, one } from "./db";
import { FormError } from "./errors";
import { matchEvent } from "./notify";
import type { Match } from "./data";
import { userSide } from "./tournament";

// Match screenshots, stored in Postgres (they're compressed to webp in the browser first).
const STAFF_ROLES = ["superadmin", "admin", "referee"];
export const MAX_FILES_PER_MATCH = 8;
export const MAX_FILE_BYTES = 1_500_000;

export type MatchFile = { id: string; mime: string; bytes: number; created_at: Date; uploader: string | null; uploader_id: string | null };

function sniff(buf: Buffer): string | null {
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

/** Who may attach screenshots: either side's players, the match referee, staff. */
export async function canUpload(m: Match, user: { id: string; role: string }) {
  if (STAFF_ROLES.includes(user.role)) return true;
  if (m.referee_user_id === user.id) return true;
  return !!(await userSide(m, user.id));
}

export async function listMatchFiles(matchId: string) {
  return q<MatchFile>(
    `select f.id, f.mime, f.bytes, f.created_at, f.uploader_id, u.rl_nickname as uploader
       from match_files f left join users u on u.id = f.uploader_id where f.match_id = $1 order by f.created_at`,
    [matchId],
  );
}

export async function saveMatchFiles(m: Match, user: { id: string; role: string }, files: File[]) {
  if (!(await canUpload(m, user))) throw new FormError("Загружать скриншоты могут только игроки матча и судья");
  const real = files.filter((f) => f && f.size > 0);
  if (!real.length) throw new FormError("Выберите скриншот");
  const have = (await one<{ n: number }>("select count(*)::int as n from match_files where match_id = $1", [m.id]))?.n ?? 0;
  if (have + real.length > MAX_FILES_PER_MATCH) throw new FormError("Не больше {n} скриншотов на матч", { n: MAX_FILES_PER_MATCH });
  for (const f of real) {
    if (f.size > MAX_FILE_BYTES) throw new FormError("Файл слишком большой (максимум 1,5 МБ)");
    const buf = Buffer.from(await f.arrayBuffer());
    const mime = sniff(buf);
    if (!mime) throw new FormError("Нужна картинка: PNG, JPG или WEBP");
    await q("insert into match_files (match_id, uploader_id, mime, bytes, data) values ($1, $2, $3, $4, $5)", [m.id, user.id, mime, buf.length, buf]);
  }
  await matchEvent(undefined, m.id, user.id, "Добавлены скриншоты: {n}", { n: real.length });
  return real.length;
}

export async function deleteMatchFile(fileId: string, user: { id: string; role: string }) {
  const f = await one<{ match_id: string; uploader_id: string | null }>("select match_id, uploader_id from match_files where id = $1", [fileId]);
  if (!f) return null;
  if (f.uploader_id !== user.id && !STAFF_ROLES.includes(user.role)) throw new FormError("Удалить можно только свой скриншот");
  await q("delete from match_files where id = $1", [fileId]);
  return f.match_id;
}

export async function getMatchFile(id: string) {
  return one<{ mime: string; data: Buffer }>("select mime, data from match_files where id = $1", [id]);
}
