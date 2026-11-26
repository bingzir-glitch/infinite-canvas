// automatic JSX 的 dev 变体(编译器在 dev 模式会引用 jsxDEV)。转发到同一套 createElement。
// 与 jsx-runtime 的 jsxs 保持一致:多个子节点走 createElement 变参,避免纯静态兄弟节点被误判为缺少 key。

import type * as React from "react";

import { getReact } from "./runtime";
import { Fragment } from "./jsx-runtime";

export { Fragment };
export type { JSX } from "./jsx-runtime";

export function jsxDEV(type: unknown, props: Record<string, unknown> | null, key?: unknown): React.ReactElement {
    const react = getReact();
    const resolvedType = type === Fragment ? react.Fragment : type;
    const { children, ...rest } = props ?? {};
    const config = key === undefined ? rest : { ...rest, key };
    return Array.isArray(children) ? react.createElement(resolvedType as never, config as never, ...(children as React.ReactNode[])) : react.createElement(resolvedType as never, config as never, children as React.ReactNode);
}
