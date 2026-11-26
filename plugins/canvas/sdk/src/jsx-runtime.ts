// automatic JSX 运行时:esbuild/tsc 的 `jsxImportSource` 指向本包时,
// TSX 会被编译成对本模块 jsx()/jsxs() 的调用。这里统一转发到宿主 React.createElement,
// 让插件写纯 TSX、无需手动 `const { React } = runtime`,同时 react 全程 external。

import type * as React from "react";

import { getReact } from "./runtime";

// Fragment 哨兵:渲染时才解析为宿主 React.Fragment,避免模块顶层触碰运行时。
export const Fragment = Symbol.for("infinite-canvas.jsx.fragment") as unknown as React.ExoticComponent<{ children?: React.ReactNode }>;

function createElement(type: unknown, props: Record<string, unknown> | null, key?: unknown): React.ReactElement {
    const react = getReact();
    const resolvedType = type === Fragment ? react.Fragment : type;
    // automatic 运行时已把 children 放进 props;key 单独传入以避免展开 key 警告。
    const config = key === undefined ? props : { ...(props ?? {}), key };
    return react.createElement(resolvedType as never, config as never);
}

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: unknown): React.ReactElement {
    return createElement(type, props, key);
}

// jsxs 用于「静态多子节点」。编译器把子节点打包成 props.children 数组传进来,
// 而 React 只对「显式数组」要求逐项 key,于是纯静态的兄弟节点也会触发
// "Each child in a list should have a unique key" 警告。
// 这里改走 createElement 的变参形式(子节点作为独立参数),React 就不会按数组校验 key,
// 语义与原生 JSX 完全一致;动态 map 出来的 children 仍由调用方自带 key。
export function jsxs(type: unknown, props: Record<string, unknown> | null, key?: unknown): React.ReactElement {
    const react = getReact();
    const resolvedType = type === Fragment ? react.Fragment : type;
    const { children, ...rest } = props ?? {};
    const config = key === undefined ? rest : { ...rest, key };
    return Array.isArray(children) ? react.createElement(resolvedType as never, config as never, ...(children as React.ReactNode[])) : react.createElement(resolvedType as never, config as never, children as React.ReactNode);
}

// 让 `jsxImportSource` 指向本包的编译器能从这里取到 JSX 内建标签类型(复用 @types/react)。
export namespace JSX {
    export type Element = React.JSX.Element;
    export type ElementType = React.JSX.ElementType;
    export type ElementClass = React.JSX.ElementClass;
    export type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
    export type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
    export type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    export type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
    export type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<T>;
    export type IntrinsicElements = React.JSX.IntrinsicElements;
}
