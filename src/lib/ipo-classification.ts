type NamedIpo = {
  name: string;
};

const spacPattern = /기업인수목적|스팩|spac/i;

export const isSpacIpo = <T extends NamedIpo>(ipo: T) => spacPattern.test(ipo.name);

export const partitionAlertEligibleIpos = <T extends NamedIpo>(ipos: T[]) => {
  const included: T[] = [];
  const excludedSpacs: T[] = [];

  for (const ipo of ipos) {
    if (isSpacIpo(ipo)) {
      excludedSpacs.push(ipo);
      continue;
    }

    included.push(ipo);
  }

  return {
    included,
    excludedSpacs,
  };
};
