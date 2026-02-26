import { createElement, FC, ReactNode } from 'react';

import { ALLOWED_TAGS, FIELD_COMPONENTS } from './constants';

import type { FormNode } from './types';

import './referral-form.css';

interface ReferralFormRendererProps {
  form: FormNode[];
  renderField: (node: FormNode, index: number) => ReactNode;
  mapNodeProps?: (node: FormNode, props: Record<string, any>) => Record<string, any>;
}

function renderNode(
  node: FormNode,
  index: number,
  renderField: ReferralFormRendererProps['renderField'],
  mapNodeProps?: ReferralFormRendererProps['mapNodeProps'],
): ReactNode {
  if (!node || !node.component) return null;

  const { component } = node;

  if (FIELD_COMPONENTS.has(component)) {
    return renderField(node, index);
  }

  return renderBaseComponent(node, index, renderField, mapNodeProps);
}

function renderBaseComponent(
  node: FormNode,
  index: number,
  renderField: ReferralFormRendererProps['renderField'],
  mapNodeProps?: ReferralFormRendererProps['mapNodeProps'],
): ReactNode {
  const { component, props = {}, children } = node;
  const key = node._key ?? index;

  const {
    text,
    inputsGroup,
    required,
    hiddenIfEmpty,
    colSpan,
    colspan,
    rowSpan,
    rowspan,
    ...domProps
  } = props;

  let tag: string;
  if (component === 'text') {
    tag = 'span';
  } else if (ALLOWED_TAGS.has(component)) {
    tag = component;
  } else {
    tag = 'div';
    domProps['data-component'] = component;
  }

  if (tag === 'td' || tag === 'th') {
    const cs = colSpan ?? colspan;
    const rs = rowSpan ?? rowspan;
    if (cs != null) domProps.colSpan = cs;
    if (rs != null) domProps.rowSpan = rs;
  }

  if (required === 'true') {
    domProps.className = domProps.className ? `${domProps.className} required` : 'required';
  }

  if (tag === 'a') {
    domProps.rel = 'noreferrer';
  }

  const finalProps = mapNodeProps ? mapNodeProps(node, domProps) : domProps;
  const hasChildren = Array.isArray(children) && children.length > 0;

  if (text && !hasChildren) {
    return createElement(tag, { key, ...finalProps }, text);
  }

  if (!hasChildren) {
    return createElement(tag, { key, ...finalProps });
  }

  return createElement(
    tag,
    { key, ...finalProps },
    children.map((child, i) => renderNode(child, i, renderField, mapNodeProps)),
  );
}

const ReferralFormRenderer: FC<ReferralFormRendererProps> = ({
  form,
  renderField,
  mapNodeProps,
}) => {
  if (!Array.isArray(form) || form.length === 0) return null;

  return (
    <div className="referral-form-preview">
      {form.map((node, i) => renderNode(node, i, renderField, mapNodeProps))}
    </div>
  );
};

export default ReferralFormRenderer;
