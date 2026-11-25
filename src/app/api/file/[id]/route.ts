import { getMatchFile } from "@/lib/files";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const f = await getMatchFile(id);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
