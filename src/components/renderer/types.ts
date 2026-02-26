export interface FormNode {
  component: string;
  _id?: string;
  _key?: string;
  props?: Record<string, any>;
  children?: FormNode[];
}
