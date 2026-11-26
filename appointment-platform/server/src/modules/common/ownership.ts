import type { Model, Types } from 'mongoose';
import { AppError } from '../../utils/AppError';

/** Ensures every id in `ids` refers to a document of `businessId` (tenant isolation for references). */
export async function assertOwned(model: Model<any>, ids: Array<string | Types.ObjectId> | undefined, businessId: Types.ObjectId, field: string) {
  if (!ids?.length) return;
  const unique = [...new Set(ids.map(String))];
  const count = await model.countDocuments({ _id: { $in: unique }, business: businessId });
  if (count !== unique.length) {
    throw new AppError(422, 'VALIDATION_ERROR', `Unknown ${field}`, { fields: { [field]: ['One or more items do not belong to this business'] } });
  }
}
