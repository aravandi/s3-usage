# Coveo DevOps Challenge

## The Challenge

Your challenge, should you choose to accept it, is to develop an AWS S3 storage analysis tool. To test your tool, you will have to create a free [Amazon](http://aws.amazon.com/en/free/) account (if you don't already have one).

## Installation
```
npm install
```

## Args
These args are available:
- bucketName
  - Type: String
- storageType
  - Type string
  - Values: STANDARD | REDUCED_REDUNDANCY | STANDARD_IA | ONEZONE_IA | INTELLIGENT_TIERING | GLACIER | DEEP_ARCHIVE
- groupby 
  - Typs string
  - Values: Region
- sizeType
  - Type: string
  - Values: 'Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'

## Run
In your command line use node to execute the tool.

Example:
```
node tool.js --bucketName xvz --storageType STANDARD --groupby Region --sizeType GB
```