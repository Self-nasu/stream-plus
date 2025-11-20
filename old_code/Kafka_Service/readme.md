<!-- install kafka -->
docker-compose up -d

<!-- check kafka status -->
docker ps

<!-- restart -->

docker restart kafka_service_zookeeper_1 kafka_service_kafka_1

<!--  Get into the running Kafka container -->
 docker exec -it kafka_service_kafka_1 bash

 <!-- # Create main video-processing topic -->
kafka-topics --create --topic video-processing-a --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
kafka-topics --create --topic video-processing-b --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1

<!-- # Create retry queue for failed conversions -->
kafka-topics --create --topic video-retry --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1


<!-- # List topics to verify -->
kafka-topics --list --bootstrap-server localhost:9092


<!-- delete the  topic -->
kafka-topics --delete --topic video-processing-a --bootstrap-server localhost:9092
kafka-topics --delete --topic video-processing-b --bootstrap-server localhost:9092
kafka-topics --delete --topic video-retry --bootstrap-server localhost:9092