// Realtime hooks. Call them AFTER the transaction commits. They are no-ops until the broadcast
// layer (R8) is wired in at merge time.
export async function notifyBoard(): Promise<void> {}
export async function notifyStatus(): Promise<void> {}
