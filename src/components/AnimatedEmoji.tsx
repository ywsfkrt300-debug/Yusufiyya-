import React from 'react';
import { motion } from 'motion/react';

interface AnimatedEmojiProps {
  emoji: string;
}

const AnimatedEmoji: React.FC<AnimatedEmojiProps> = ({ emoji }) => {
  return (
    <motion.div
      initial={{ scale: 0.5, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      whileHover={{ scale: 1.2, rotate: 10 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      className="text-4xl inline-block"
    >
      {emoji}
    </motion.div>
  );
};

export default AnimatedEmoji;
