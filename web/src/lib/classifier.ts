import type { ModelManifest, WindowPrediction } from './onnxProtocol';
export type { ModelManifest, WindowPrediction } from './onnxProtocol';

/** Owns a worker and all request lifetimes. No camera pixels cross this interface. */
export class Classifier {
  private worker: Worker;
  private next = 0;
  private closed = false;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  manifest!: ModelManifest;
  private constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = event => {
      const { id, result, error } = event.data, request = this.pending.get(id);
      if (!request) return;
      this.pending.delete(id); clearTimeout(request.timer);
      if (error) request.reject(new Error(error)); else request.resolve(result);
    };
    worker.onerror = () => this.close();
    worker.onmessageerror = () => this.close();
  }
  static async create(signal?: AbortSignal, workerFactory = () => new Worker(new URL('./onnxWorker.ts', import.meta.url), { type: 'module' })) {
    signal?.throwIfAborted();
    const client = new Classifier(workerFactory());
    const abort = () => client.close();
    signal?.addEventListener('abort', abort, { once: true });
    client.onClose = () => signal?.removeEventListener('abort', abort);
    try {
      client.manifest = await client.request({ type: 'init', base: new URL(`${import.meta.env.BASE_URL}models/`, location.href).href }) as ModelManifest;
      signal?.throwIfAborted();
      return client;
    } catch (error) { client.close(); throw error; }
  }
  private onClose = () => {};
  private request(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Local inference stopped.'));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ ...message, id }, transfer); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async predictWindow(features: Float32Array, stage: 'c1' | 'b' = 'c1'): Promise<WindowPrediction> {
    if (this.pending.size) throw new Error('Inference is busy.');
    const copy = features.slice();
    return await this.request({ type: 'predict', features: copy, stage }, [copy.buffer]) as WindowPrediction;
  }
  async extractEmbedding(features: Float32Array) { return (await this.predictWindow(features)).embedding; }
  close() {
    if (this.closed) return;
    this.closed = true; this.worker.terminate(); this.onClose();
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Local inference stopped.')); }
    this.pending.clear();
  }
}
