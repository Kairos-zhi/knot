/**
 * 无头断言脚本的环境垫片（必须最先 import）
 * 1) use-hooks-observe default 链透传（node 下 CJS interop 炸）
 * 2) 极简 DOM stub：flowgram 的 DI 链上 PipelineRenderer 等会 createDivWithClass，
 *    但本断言只走 document/linesManager 数据层，DOM 不被真实读写。
 */
/* eslint-disable */
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  const m = origLoad.apply(this, [request, parent, isMain]);
  if (request === 'use-hooks-observe' && m && typeof m === 'object' && !('default' in m)) {
    return { ...m, default: m };
  }
  return m;
};

const fakeClassList = () => ({
  add: () => undefined,
  remove: () => undefined,
  toggle: () => undefined,
  contains: () => false,
});

function fakeElement(tag = 'div'): any {
  const el: any = {
    tagName: tag.toUpperCase(),
    style: {},
    classList: fakeClassList(),
    dataset: {},
    children: [] as any[],
    childNodes: [] as any[],
    parentNode: null,
    ownerDocument: null,
    appendChild(child: any) {
      child.parentNode = el;
      el.children.push(child);
      el.childNodes.push(child);
      return child;
    },
    removeChild(child: any) {
      el.children = el.children.filter((c: any) => c !== child);
      el.childNodes = el.childNodes.filter((c: any) => c !== child);
      return child;
    },
    remove: () => undefined,
    setAttribute: () => undefined,
    getAttribute: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    insertBefore: (c: any) => c,
    cloneNode: () => fakeElement(tag),
    focus: () => undefined,
    blur: () => undefined,
    click: () => undefined,
    contains: () => false,
    scrollTop: 0,
    scrollLeft: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    innerText: '',
    textContent: '',
    tabIndex: 0,
  };
  return el;
}

const g: any = globalThis;
if (!g.window) {
  const body = fakeElement('body');
  g.window = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    getComputedStyle: () => ({}),
    requestAnimationFrame: (cb: any) => setTimeout(cb, 16),
    cancelAnimationFrame: clearTimeout,
    devicePixelRatio: 1,
    innerWidth: 1024,
    innerHeight: 768,
    navigator: { userAgent: 'node', language: 'zh-CN' },
    CustomEvent: class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, init?: any) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
}
if (!g.navigator) g.navigator = g.window.navigator;
if (!g.document) {
  g.document = {
    createElement: (tag: string) => fakeElement(tag),
    createElementNS: (_ns: string, tag: string) => fakeElement(tag),
    createTextNode: (t: string) => ({ textContent: t }),
    body: fakeElement('body'),
    documentElement: fakeElement('html'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    activeElement: null,
  };
}
if (!g.CustomEvent) g.CustomEvent = g.window.CustomEvent;
if (!g.MutationObserver) g.MutationObserver = g.window.MutationObserver;
if (!g.requestAnimationFrame) {
  g.requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
  g.cancelAnimationFrame = clearTimeout;
}
if (!g.getComputedStyle) g.getComputedStyle = () => ({});
