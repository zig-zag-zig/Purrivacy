export const toDate = (value: any): Date => {
    return value?.toDate ? value.toDate() : value;
};

export const isValidDate = (value: Date | null | undefined): value is Date => {
    return value instanceof Date && !Number.isNaN(value.getTime());
};

