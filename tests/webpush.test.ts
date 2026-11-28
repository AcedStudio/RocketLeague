import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, createDecipheriv, hkdfSync, randomBytes, generateKeyPairSync, verify, createPublicKey } from "node:crypto";
import { encryptPayload, vapidHeader, b64u, unb64u } from "../src/lib/engine/webpush.ts";

test("web push: a browser can decrypt our payload (RFC 8291 round trip)", () => {
  const ua = createECDH("prime256v1");
  const uaPub = ua.generateKeys();
  const auth = randomBytes(16);
  const msg = Buffer.from(JSON.stringify({ title: "Матч через час", url: "/match/x" }));
  const body = encryptPayload(msg, b64u(uaPub), b64u(auth));
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPub);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, "last-record delimiter");
  assert.equal(plain.subarray(0, -1).toString(), msg.toString());
});

test("web push: VAPID JWT is a valid ES256 signature for the endpoint origin", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const raw = publicKey.export({ format: "jwk" });
  const pub = b64u(Buffer.concat([Buffer.from([4]), unb64u(raw.x!), unb64u(raw.y!)]));
  const h = vapidHeader("https://fcm.googleapis.com/fcm/send/abc", jwk, pub, "mailto:a@b.c");
  const [, token, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert.equal(k, pub);
  const [hd, pl, sg] = token.split(".");
  assert.equal(JSON.parse(unb64u(pl).toString()).aud, "https://fcm.googleapis.com");
  assert.ok(verify("sha256", Buffer.from(`${hd}.${pl}`), { key: createPublicKey({ key: raw, format: "jwk" }), dsaEncoding: "ieee-p1363" }, unb64u(sg)));
});
