import "server-only";
import { storeBusy, whileStoreBusy } from "@/lib/photos";

/** A photo store request from the server, tried again while the store is busy (decision C, lib/photos.ts). */
export const stored = <T extends { error: { message: string } | null }>(request: () => PromiseLike<T>) =>
  whileStoreBusy(request, (result) => !!result.error && storeBusy(result.error.message));
