/**
 * FieldRenderer.jsx
 *
 * Preview-only field rendering for form field components (input, textarea,
 * imageinput, mobileimageinput, image). Mirrors core-web ReferralForm.tsx
 * field rendering but without React Hook Form — all inputs are uncontrolled.
 */

export default function FieldRenderer({ node, syncProps }) {
  const { component, props = {} } = node

  const {
    type = 'text',
    className,
    style,
    id,
    name,
    value,
    checked,
    htmlFor,
    src,
    height,
    width,
    required,
    text,
    colSpan,
    colspan,
    rowSpan,
    rowspan,
  } = props

  const finalClassName = [className, required === 'true' && 'required', syncProps?.className]
    .filter(Boolean)
    .join(' ')

  // Sync attributes (data-node-id, data-occurrence, onClick) minus className (merged above)
  const { className: _sc, ...syncAttrs } = syncProps ?? {}

  switch (component) {
    case 'input': {
      if (type === 'checkbox' || type === 'radio') {
        return (
          <input
            type={type}
            id={id}
            name={name}
            defaultValue={value}
            defaultChecked={checked}
            className={finalClassName}
            style={style}
            {...syncAttrs}
          />
        )
      }
      return (
        <input
          type={type}
          id={id}
          name={name}
          defaultValue={value ?? ''}
          className={finalClassName}
          style={style}
          {...syncAttrs}
        />
      )
    }

    case 'textarea':
      return (
        <textarea
          id={id}
          name={name}
          className={finalClassName}
          style={style}
          defaultValue={value ?? ''}
          {...syncAttrs}
        />
      )

    case 'imageinput':
    case 'mobileimageinput':
      return (
        <div
          id={id}
          className={['image-placeholder', syncProps?.className].filter(Boolean).join(' ')}
          data-component={component}
          {...syncAttrs}
        >
          Image attachment area
        </div>
      )

    case 'image':
      if (src) {
        return (
          <img
            src={src}
            alt=""
            height={height}
            width={width}
            className={finalClassName}
            style={style}
            {...syncAttrs}
          />
        )
      }
      return (
        <div
          id={id}
          className={['image-placeholder', syncProps?.className].filter(Boolean).join(' ')}
          data-component={component}
          {...syncAttrs}
        >
          Image placeholder
        </div>
      )

    default:
      return null
  }
}
