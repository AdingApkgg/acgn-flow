import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ensureRuffleLoaded, startRufflePlayer } from "../src/lib/ruffle-frame-runtime.js";

class Script extends EventTarget {
  src = "";
  removed = false;
  remove() {
    this.removed = true;
  }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
let scripts: Script[];
let api: { newest: () => { createPlayer: () => HTMLElement } };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function playerFixture(load: () => Promise<void>) {
  const remove = mock(() => {});
  const player = { style: {}, load: mock(load), remove };
  api = { newest: () => ({ createPlayer: () => player as unknown as HTMLElement }) };
  Object.defineProperty(globalThis, "window", {
    value: { RufflePlayer: api, location: { href: "https://app.test/flash-frame" } },
    configurable: true,
  });
  const appendChild = mock(() => {});
  const container = { appendChild } as unknown as HTMLElement;
  return { container, appendChild, player, remove };
}

beforeEach(() => {
  scripts = [];
  Object.defineProperty(globalThis, "window", {
    value: { location: { href: "https://app.test/flash-frame" } },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: {
      querySelector: () => scripts.find((script) => !script.removed) || null,
      createElement: () => new Script(),
      head: { appendChild: (script: Script) => scripts.push(script) },
    },
    configurable: true,
  });
});

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

describe("Ruffle 加载任务与清理", () => {
  test("共享脚本失败和超时后可重新请求，卸载的任务不会创建实例", async () => {
    const ready = mock(() => {});
    const error = mock((_error: unknown) => {});
    const createPlayer = mock(() => ({}) as HTMLElement);
    const appendChild = mock(() => {});
    const first = ensureRuffleLoaded("https://app.test/ruffle/ruffle.js");
    expect(ensureRuffleLoaded("https://app.test/ruffle/ruffle.js")).toBe(first);
    const stop = startRufflePlayer(
      { appendChild } as unknown as HTMLElement,
      "/uploads/a.swf",
      ready,
      error,
    );
    stop();
    scripts[0].dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow("Ruffle 加载失败");
    expect(scripts[0].removed).toBe(true);

    await expect(ensureRuffleLoaded("https://app.test/ruffle/ruffle.js", 1)).rejects.toThrow(
      "Ruffle 加载超时",
    );
    expect(scripts[1].removed).toBe(true);
    const retry = ensureRuffleLoaded("https://app.test/ruffle/ruffle.js");
    Object.assign(window, { RufflePlayer: { newest: () => ({ createPlayer }) } });
    scripts[2].dispatchEvent(new Event("load"));
    await retry;
    await tick();
    expect(scripts).toHaveLength(3);
    expect(createPlayer).not.toHaveBeenCalled();
    expect(appendChild).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test("内容加载中卸载会立即移除实例，迟到的完成不会通知页面", async () => {
    let resolveLoad!: () => void;
    const load = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const fixture = playerFixture(() => load);
    const ready = mock(() => {});
    const error = mock((_error: unknown) => {});
    const stop = startRufflePlayer(fixture.container, "/uploads/a.swf", ready, error);
    await tick();
    expect(fixture.appendChild).toHaveBeenCalledTimes(1);
    expect(fixture.player.load).toHaveBeenCalledWith(
      expect.objectContaining({
        allowScriptAccess: false,
        openUrlMode: "deny",
        credentialAllowList: [],
      }),
    );
    stop();
    expect(fixture.remove).toHaveBeenCalledTimes(1);
    resolveLoad();
    await tick();
    expect(ready).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test("内容失败会移除实例并通知页面", async () => {
    const fixture = playerFixture(async () => {
      throw new Error("损坏的 SWF");
    });
    const ready = mock(() => {});
    const error = mock((_error: unknown) => {});
    const stop = startRufflePlayer(fixture.container, "/uploads/a.swf", ready, error);
    await tick();
    expect(fixture.remove).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
    stop();
    expect(fixture.remove).toHaveBeenCalledTimes(1);
  });

  test("不结束的内容加载会超时并移除实例", async () => {
    const fixture = playerFixture(() => new Promise(() => {}));
    const error = mock((_error: unknown) => {});
    const stop = startRufflePlayer(fixture.container, "/uploads/a.swf", () => {}, error, 1);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toEqual(new Error("Flash 内容加载超时"));
    expect(fixture.remove).toHaveBeenCalledTimes(1);
    stop();
  });

  test("旧加载任务结束不会移除重试后创建的新实例", async () => {
    let rejectOld!: (error: Error) => void;
    const oldLoad = new Promise<void>((_, reject) => {
      rejectOld = reject;
    });
    const oldFixture = playerFixture(() => oldLoad);
    const stopOld = startRufflePlayer(
      oldFixture.container,
      "/uploads/old.swf",
      () => {},
      () => {},
    );
    await tick();
    stopOld();
    const nextFixture = playerFixture(async () => {});
    const ready = mock(() => {});
    const error = mock((_error: unknown) => {});
    const stopNext = startRufflePlayer(nextFixture.container, "/uploads/new.swf", ready, error);
    rejectOld(new Error("旧任务失败"));
    await tick();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(oldFixture.remove).toHaveBeenCalledTimes(1);
    expect(nextFixture.remove).not.toHaveBeenCalled();
    stopNext();
    expect(nextFixture.remove).toHaveBeenCalledTimes(1);
  });
});
