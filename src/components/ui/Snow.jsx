import React from 'react';
import './Snow.css';

const Snow = () => {
    return (
        <div className="snow-container" aria-hidden="true">
            {Array.from({ length: 50 }).map((_, i) => (
                <div key={i} className="snowflake">❄</div>
            ))}
        </div>
    );
};

export default Snow;
