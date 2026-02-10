import { ref } from 'vue';

export function useMobileInput() {
  const forward = ref(0);
  const right = ref(0);
  const rotateLeft = ref(false);
  const rotateRight = ref(false);
  
  const handleInputChange = (fwd: number, rt: number, rotLeft: boolean, rotRight: boolean) => {
    forward.value = fwd;
    right.value = rt;
    rotateLeft.value = rotLeft;
    rotateRight.value = rotRight;
  };
  
  return {
    forward,
    right,
    rotateLeft,
    rotateRight,
    handleInputChange
  };
}
