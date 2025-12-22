import React from 'react';
import './Card.css';

const Card = ({ children, className = '', style = {} }) => {
    return (
        <div className={`christmas-card ${className}`} style={style}>
            {children}
        </div>
    );
};

export default Card;
