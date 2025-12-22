import React from 'react';
import Card from './Card';
import Button from './Button';
import './Modal.css';

const Modal = ({
    isOpen,
    title,
    children,
    onClose,
    onConfirm,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDestructive = false,
    showCancel = true
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content-wrapper" onClick={e => e.stopPropagation()}>
                <Card>
                    <h2 style={{ marginBottom: '1rem', color: isDestructive ? 'red' : 'inherit' }}>{title}</h2>
                    <div className="modal-body" style={{ fontSize: '1.2rem', lineHeight: '1.5' }}>
                        {children}
                    </div>
                    <div className="modal-actions">
                        {showCancel && (
                            <Button onClick={onClose} variant="secondary">
                                {cancelText}
                            </Button>
                        )}
                        {onConfirm ? (
                            <Button
                                onClick={onConfirm}
                                variant={isDestructive ? 'primary' : 'primary'} // can style destructive differently if needed
                                style={isDestructive ? { backgroundColor: '#c0392b' } : {}}
                            >
                                {confirmText}
                            </Button>
                        ) : (
                            // Only Close button if no confirm action (Alert style)
                            !showCancel && <Button onClick={onClose} variant="primary">OK</Button>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Modal;
