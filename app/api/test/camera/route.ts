import { passcodeOk } from "@/lib/test-session";
import { CAMERA_MODELS, type CameraModel, nameItem } from "@/lib/test-camera";

// Phase 0 test only: names the clothing item in one camera frame.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!passcodeOk(body?.passcode)) {
    return Response.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const image = body?.image;
  if (typeof image !== "string" || image.length > 1_500_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return Response.json({ error: "A JPEG frame is required" }, { status: 400 });
  }
  const model: CameraModel = CAMERA_MODELS.includes(body?.model) ? body.model : "claude-haiku-5-5";
  const started = Date.now();
  const { name, costUSD } = await nameItem(image, model);
  return Response.json({ name, model, costUSD, serverMs: Date.now() - started });
}
