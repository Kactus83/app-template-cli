import { IStorageService, IDbService, IComputeService } from "./types.js";
import { GoogleStorageService } from "./google/google-storage-service.js";
import { GoogleDbService } from "./google/google-db-service.js";
import { AwsStorageService } from "./aws/aws-storage-service.js";
import { AwsDbService } from "./aws/aws-db-service.js";
import { GoogleCliConfig, AWSCliConfig, Provider } from "../../config/cli-config.js";
import { GoogleComputeService } from "./google/google-compute-service.js";
import { AwsComputeService } from "./aws/aws-compute-service.js";

export class CloudProviderServices {
  public storage: IStorageService;
  public database: IDbService;
  public compute: IComputeService;

  private constructor(
    storage: IStorageService,
    database: IDbService,
    compute: IComputeService
  ) {
    this.storage = storage;
    this.database = database;
    this.compute = compute;
  }

  static forConfig(config: GoogleCliConfig | AWSCliConfig): CloudProviderServices {
    switch (config.provider.name) {
      case Provider.GOOGLE_CLOUD:
        const gcfg = config as GoogleCliConfig;
        return new CloudProviderServices(
          new GoogleStorageService(gcfg),
          new GoogleDbService(gcfg),
          new GoogleComputeService(gcfg)
        );
      case Provider.AWS:
        const acfg = config as AWSCliConfig;
        return new CloudProviderServices(
          new AwsStorageService(acfg),
          new AwsDbService(acfg),
          new AwsComputeService(acfg)
        );
      default:
        throw new Error(`Provider non supporté : ${config.provider.name}`);
    }
  }
}