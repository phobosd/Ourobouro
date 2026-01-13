import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

const MatrixCharacter = ({ char, position, speed }: { char: string, position: [number, number, number], speed: number }) => {
    const ref = useRef<THREE.Group>(null);

    // We'll let the parent manage the updates for better performance
    // but keep the ref for the parent to access
    return (
        <group ref={ref} position={position} userData={{ speed }}>
            <Text
                fontSize={0.6}
                color="#00ff41"
                font="monospace"
                anchorX="center"
                anchorY="middle"
                fillOpacity={0.4}
            >
                {char}
            </Text>
        </group>
    );
};

const MatrixField = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?/ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
    const groupRef = useRef<THREE.Group>(null);

    const field = useMemo(() => {
        const temp = [];
        // Reduced count for better performance
        for (let i = 0; i < 60; i++) {
            const char = characters.charAt(Math.floor(Math.random() * characters.length));
            const x = (Math.random() - 0.5) * 40;
            const y = (Math.random() - 0.5) * 30;
            const z = Math.random() * -40;
            const speed = 2.0 + Math.random() * 5.0; // Faster speed
            temp.push({ char, position: [x, y, z] as [number, number, number], speed });
        }
        return temp;
    }, [characters]);

    useFrame((_state, delta) => {
        if (groupRef.current) {
            groupRef.current.children.forEach((child) => {
                const speed = child.userData.speed || 1;
                child.position.z += speed * delta * 5;
                if (child.position.z > 10) {
                    child.position.z = -40;
                }
            });
        }
    });

    return (
        <group ref={groupRef}>
            {field.map((item, i) => (
                <MatrixCharacter key={i} {...item} />
            ))}
        </group>
    );
};

export const MatrixBackground3D: React.FC = React.memo(() => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: -1,
            background: 'black',
            pointerEvents: 'none'
        }}>
            <Canvas
                camera={{ position: [0, 0, 10], fov: 60 }}
                dpr={[1, 1.5]} // Limit pixel ratio for performance
                gl={{ antialias: false, powerPreference: "high-performance" }}
            >
                <color attach="background" args={['black']} />
                <ambientLight intensity={0.5} />
                <MatrixField />
                <fog attach="fog" args={['black', 10, 45]} />
            </Canvas>
        </div>
    );
});
