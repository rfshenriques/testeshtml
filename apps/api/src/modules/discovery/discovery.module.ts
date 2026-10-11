import { Module } from '@nestjs/common';
import { TerritoryModule } from '../territory/territory.module';
import { placesClientProvider } from './places.provider';
import { DiscoveryService } from './discovery.service';
import { DetailsService } from './details.service';

@Module({
  imports: [TerritoryModule],
  providers: [placesClientProvider, DiscoveryService, DetailsService],
  exports: [DiscoveryService, DetailsService, placesClientProvider],
})
export class DiscoveryModule {}
