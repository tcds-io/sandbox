/** CPF / CNPJ check-digit validation, as Asaas applies on customer creation. */

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

const allSame = (value: string): boolean => /^(\d)\1+$/.test(value);

function cpfIsValid(cpf: string): boolean {
  if (cpf.length !== 11 || allSame(cpf)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

function cnpjIsValid(cnpj: string): boolean {
  if (cnpj.length !== 14 || allSame(cnpj)) return false;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

/** Returns the digits-only document and its person type, or undefined if it is not a valid CPF/CNPJ. */
export function parseCpfCnpj(value: string): { digits: string; personType: "FISICA" | "JURIDICA" } | undefined {
  const digits = onlyDigits(value);
  if (cpfIsValid(digits)) return { digits, personType: "FISICA" };
  if (cnpjIsValid(digits)) return { digits, personType: "JURIDICA" };
  return undefined;
}

export { onlyDigits };
