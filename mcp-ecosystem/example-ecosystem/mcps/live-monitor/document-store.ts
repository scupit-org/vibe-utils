export interface StoredDocument {
  taskId: string;
  userId: string;
  documentId: string;
  status: "working" | "completed" | "failed" | "cancelled";
  progress: number;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory, user-scoped document store.
 *
 * Outer key: Auth0 `sub` claim (stable user ID)
 * Inner key: taskId (UUID)
 *
 * Not persistent — data is lost on server restart.
 * The Map-based structure is designed so that a database or Redis client
 * can be substituted without changing the interface.
 */
export class DocumentStore {
  private readonly _store = new Map<string, Map<string, StoredDocument>>();

  createTask(userId: string, taskId: string, documentId: string): StoredDocument {
    const doc: StoredDocument = {
      taskId,
      userId,
      documentId,
      status: "working",
      progress: 0,
      content: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!this._store.has(userId)) {
      this._store.set(userId, new Map());
    }
    this._store.get(userId)!.set(taskId, doc);
    return doc;
  }

  getTask(userId: string, taskId: string): StoredDocument | undefined {
    return this._store.get(userId)?.get(taskId);
  }

  listTasks(userId: string): StoredDocument[] {
    return Array.from(this._store.get(userId)?.values() ?? []);
  }

  updateTask(
    userId: string,
    taskId: string,
    updates: Partial<Pick<StoredDocument, "status" | "progress" | "content">>
  ): StoredDocument | undefined {
    const doc = this.getTask(userId, taskId);
    if (!doc) return undefined;
    Object.assign(doc, updates, { updatedAt: new Date() });
    return doc;
  }

  deleteTask(userId: string, taskId: string): boolean {
    return this._store.get(userId)?.delete(taskId) ?? false;
  }
}
