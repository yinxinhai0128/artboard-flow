import "@testing-library/jest-dom/vitest";

// Polyfills for Ant Design components in jsdom
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (typeof global !== "undefined" && !(global as unknown as Record<string, unknown>).ResizeObserver) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (global as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
  (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
}

// suppress getComputedStyle pseudo-element warning
if (typeof window !== "undefined") {
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = ((elt: Element, pseudoElt?: string | null) => {
    try {
      return originalGetComputedStyle(elt, pseudoElt as never);
    } catch {
      return originalGetComputedStyle(elt);
    }
  }) as typeof window.getComputedStyle;
}
if (typeof window !== "undefined" && !window.getComputedStyle) {
  // fallback
}
