import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Product } from "../../shared/scan";
import { ModelChoices } from "./ModelChoices";

export function ModelChoiceDialog({
  product,
  onChoose,
  onClose,
}: {
  product: Product;
  onChoose: (key: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="product-dialog model-dialog"
      aria-labelledby="model-dialog-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-head">
          <span className="pill subtle">IDENTIFY YOUR ITEM</span>
          <button
            className="icon-button"
            aria-label="Close model choices"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <h2 id="model-dialog-title">Which one is yours?</h2>
        <p className="muted">
          Visual matches, not confirmed models. Check the label or details.
        </p>
        <ModelChoices
          candidates={product.candidates || []}
          onChoose={onChoose}
        />
      </div>
    </dialog>
  );
}
