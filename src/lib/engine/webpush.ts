// Web Push without dependencies: RFC 8291 payload encryption (aes128gcm) and RFC 8292 VAPID (ES256 JWT).
import { createECDH, createCipheriv, hkdfSync, randomBytes, sign, createPrivateKey, type KeyObject } from "node:crypto";

export const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
export const unb64u = (s: string) => Buffer.from(s, "base64url");

/** Encrypts a payload for one subscription (p256dh + auth from the browser). Returns the request body. */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string, salt = randomBytes(16)) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** VAPID Authorization header for a push endpoint. */
export function vapidHeader(endpoint: string, privateJwk: JsonWebKey, publicKey: string, subject: string) {
  const aud = new URL(endpoint).origin;
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key: KeyObject = createPrivateKey({ key: privateJwk as never, format: "jwk" });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}
