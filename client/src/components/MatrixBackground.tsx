import React, { useEffect, useRef } from 'react';

export const MatrixBackground: React.FC = React.memo(() => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?/ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';

        // Create multiple layers for parallax effect
        const layers = [
            { fontSize: 10, speed: 1, opacity: 0.1, count: Math.floor(width / 10) },
            { fontSize: 14, speed: 2, opacity: 0.2, count: Math.floor(width / 14) },
            { fontSize: 20, speed: 3, opacity: 0.3, count: Math.floor(width / 20) }
        ];

        const drops = layers.map(layer => {
            return new Array(layer.count).fill(0).map(() => Math.random() * height / layer.fontSize);
        });

        let animationFrameId: number;

        const draw = () => {
            // Draw black background with slight transparency for trail effect
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, width, height);

            layers.forEach((layer, layerIndex) => {
                ctx.fillStyle = `rgba(0, 255, 65, ${layer.opacity})`;
                ctx.font = `${layer.fontSize}px monospace`;

                const layerDrops = drops[layerIndex];
                for (let i = 0; i < layerDrops.length; i++) {
                    const text = characters.charAt(Math.floor(Math.random() * characters.length));
                    const x = i * layer.fontSize;
                    const y = layerDrops[i] * layer.fontSize;

                    ctx.fillText(text, x, y);

                    // Reset drop if it goes off screen
                    if (y > height && Math.random() > 0.975) {
                        layerDrops[i] = 0;
                    }
                    layerDrops[i] += layer.speed * 0.5;
                }
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        const handleResize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            // Re-calculate counts
            layers[0].count = Math.floor(width / 10);
            layers[1].count = Math.floor(width / 14);
            layers[2].count = Math.floor(width / 20);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: -1,
                background: 'black',
                pointerEvents: 'none'
            }}
        />
    );
});
