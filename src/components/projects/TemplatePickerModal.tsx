import { getTemplatesForEngine, type StarterTemplate } from "../../templates";

export interface TemplatePickerModalProps {
  isOpen: boolean;
  engine: string;
  onClose: () => void;
  onPick: (t: StarterTemplate) => void;
}

export function TemplatePickerModal({ isOpen, engine, onClose, onPick }: TemplatePickerModalProps) {
  if (isOpen === false) {
    return null;
  }

  const templates = getTemplatesForEngine(engine);

  return (
    <div role="dialog" aria-label="Pick a starter template">
      <h2>Pick a starter template</h2>
      <ul>
        {templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => {
                onPick(template);
                onClose();
              }}
            >
              <span>{template.name}</span>
              <span>{template.description}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
